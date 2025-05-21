const fileListUl = document.getElementById('fileList');
const saveButton = document.getElementById('saveButton');
const newFileBtn = document.getElementById('newFileBtn');
const newDirectoryBtn = document.getElementById('newDirectoryBtn');
const uploadFilesBtn = document.getElementById('uploadFilesBtn'); 
const uploadFilesInput = document.getElementById('uploadFilesInput'); 
const uploadFolderBtn = document.getElementById('uploadFolderBtn'); 
const uploadFolderInput = document.getElementById('uploadFolderInput'); 
const editorMessageDiv = document.getElementById('editorMessage');
const currentFileDisplayDiv = document.getElementById('currentFileDisplay');
const currentPathDisplayElement = document.getElementById('currentPathDisplay');
const API_BASE_URL = 'http://localhost:3000/api'; 

let currentProject = '';
let currentOpenFileFullPath = []; 
let editor; 
let storageType = 'backend'; 
let rootProjectDirHandle = null; 
let currentDirectoryHandle = null; 
let currentPathSegments = [];   
let expandedFolders = {}; 
const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'];


function displayEditorMessage(message, type = 'error') { 
  editorMessageDiv.textContent = message;
  editorMessageDiv.className = 'user-message ' + type; 
  editorMessageDiv.style.display = 'inline-block';
  setTimeout(() => {
    editorMessageDiv.style.display = 'none';
    editorMessageDiv.textContent = '';
    editorMessageDiv.className = 'user-message'; 
  }, 6000); 
}

function updateCurrentFileDisplay(itemPathArray = [], isImage = false) {
  currentOpenFileFullPath = [...itemPathArray];
  const displayPath = itemPathArray.join('/') || 'None';
  const actionText = isImage ? "Viewing: " : "Editing: ";
  currentFileDisplayDiv.textContent = actionText + displayPath;
  if (itemPathArray.length === 0 && editor) { 
     editor.setValue('// Select or create a file to begin.');
     document.getElementById('monacoEditorContainer').style.display = 'block'; // Ensure editor is visible
  }
}

function updatePathDisplay() {
    currentPathDisplayElement.textContent = `${currentProject} / ${currentPathSegments.join(' / ')}`;
}

// --- Backend-based file operations (legacy) ---
function fetchProjectFilesBackend(projectName) {
  fileListUl.innerHTML = ''; 
  currentPathSegments = []; 
  updatePathDisplay();
   fetch(`${API_BASE_URL}/files?project=${encodeURIComponent(projectName)}`)
    .then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e)))
    .then(files => { 
      if (files.length === 0) {
        fileListUl.innerHTML = '<li>No files in this project.</li>'; return;
      }
      files.sort((a,b) => a.isDirectory === b.isDirectory ? a.name.localeCompare(b.name) : a.isDirectory ? -1 : 1);
      files.forEach(file => { 
        const li = document.createElement('li');
        const iconSpan = document.createElement('span');
        iconSpan.className = 'file-icon';
        let iconChar = file.isDirectory ? '📁 ' : '📄 ';
        const fileExtension = file.name.split('.').pop().toLowerCase();
        if (!file.isDirectory) {
            if (imageExtensions.includes(fileExtension)) iconChar = '🖼️ ';
            else if (fileExtension === 'ini') iconChar = '📜 ';
            else if (fileExtension === 'lua') iconChar = '🌙 ';
        }
        iconSpan.textContent = iconChar;
        li.appendChild(iconSpan);

        const nameSpan = document.createElement('span');
        nameSpan.textContent = file.name;
        li.appendChild(nameSpan);
        li.className = file.isDirectory ? 'type-directory' : 'type-file';
        if (!file.isDirectory) {
          // Backend mode doesn't have image viewer, so all files load in editor
          li.onclick = () => loadFileContentBackend(projectName, [file.name]);
        }
        fileListUl.appendChild(li);
      });
    })
    .catch(e => displayEditorMessage(`Failed to load project files (backend): ${e.message || 'Unknown error'}`, 'error'));
}

function loadFileContentBackend(projectName, itemPathArray) {
  const fileName = itemPathArray.join('/'); 
  if (editor) {
      document.getElementById('monacoEditorContainer').style.display = 'block'; // Show editor
      editor.setValue('// Loading (backend)...'); 
  }
  fetch(`${API_BASE_URL}/file?project=${encodeURIComponent(projectName)}&filename=${encodeURIComponent(fileName)}`)
    .then(r => r.ok ? r.text() : r.text().then(e => Promise.reject(new Error(e))))
    .then(content => {
      if (editor) {
        const model = editor.getModel();
        let language = 'plaintext'; // Default
        const extension = fileName.split('.').pop().toLowerCase();

        switch (extension) {
            case 'lua': language = 'lua'; break;
            case 'ini': language = 'ini'; break;
            case 'json': language = 'json'; break;
            case 'html': case 'htm': language = 'html'; break;
            case 'css': language = 'css'; break;
            case 'js': language = 'javascript'; break;
            case 'md': case 'markdown': language = 'markdown'; break;
            case 'xml': language = 'xml'; break;
            case 'py': language = 'python'; break;
            case 'java': language = 'java'; break;
            case 'c': case 'cpp': case 'h': language = 'cpp'; break;
            case 'sh': case 'bash': language = 'shell'; break;
            case 'txt': language = 'plaintext'; break;
        }

        if (model) {
            monaco.editor.setModelLanguage(model, language);
        }
        editor.setValue(content);
      }
      updateCurrentFileDisplay(itemPathArray); 
    })
    .catch(e => {
      displayEditorMessage(`Failed to load file '${fileName}' (backend): ${e.message || 'Unknown error'}`, 'error');
      if (editor) editor.setValue(`// Could not load ${fileName}.`); 
      updateCurrentFileDisplay([]); 
    });
}

// --- OPFS-based file operations (with Tree View & Image Viewer) ---
async function renderExplorerItem(entry, parentUlElement, projectName, entryPathArray, depth) {
    const li = document.createElement('li');
    const itemContentDiv = document.createElement('div');
    itemContentDiv.className = 'item-content';
    itemContentDiv.setAttribute('tabindex', '0'); // Make focusable
    const fullPathKey = entryPathArray.join('/');
    const iconSpan = document.createElement('span');
    iconSpan.className = 'file-icon';

    if (entry.kind === 'directory') {
        const toggleSpan = document.createElement('span');
        toggleSpan.className = 'folder-toggle';
        toggleSpan.textContent = expandedFolders[fullPathKey] ? '▼' : '▶';
        toggleSpan.onclick = async (e) => {
            e.stopPropagation();
            expandedFolders[fullPathKey] = !expandedFolders[fullPathKey];
            const subList = li.querySelector('ul');
            if (expandedFolders[fullPathKey] && !subList) { 
                await renderChildren(entry, li, projectName, entryPathArray, depth);
                toggleSpan.textContent = '▼'; 
            } else if (subList) {
                subList.style.display = expandedFolders[fullPathKey] ? 'block' : 'none';
                toggleSpan.textContent = expandedFolders[fullPathKey] ? '▼' : '▶';
            }
        };
        itemContentDiv.appendChild(toggleSpan);
        iconSpan.textContent = '📁 ';
        li.className = 'type-directory';
        itemContentDiv.onclick = (e) => toggleSpan.click(); 
    } else { 
        const fileExtension = entry.name.split('.').pop().toLowerCase();
        if (imageExtensions.includes(fileExtension)) {
            iconSpan.textContent = '🖼️ ';
            itemContentDiv.onclick = () => showImageViewer(projectName, entryPathArray);
        } else {
            switch (fileExtension) {
                case 'txt': iconSpan.textContent = '📄 '; break; case 'ini': iconSpan.textContent = '📜 '; break;
                case 'md': iconSpan.textContent = '📝 '; break; 
                case 'lua': iconSpan.textContent = '🌙 '; break; case 'js': iconSpan.textContent = '🟡 '; break;
                case 'json': iconSpan.textContent = '{ } '; break; case 'html': iconSpan.textContent = '🌐 '; break;
                case 'css': iconSpan.textContent = '🎨 '; break; default: iconSpan.textContent = '📎 '; break;
            }
            itemContentDiv.onclick = () => loadOpfsFileContent(projectName, entryPathArray);
        }
        li.className = 'type-file';
        itemContentDiv.style.cursor = 'pointer';
    }

    itemContentDiv.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            itemContentDiv.click();
        }
    });
    
    itemContentDiv.appendChild(iconSpan);
    const nameSpan = document.createElement('span');
    nameSpan.textContent = entry.name;
    itemContentDiv.appendChild(nameSpan);
    li.appendChild(itemContentDiv);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.textContent = '🗑️';
    deleteBtn.title = `Delete ${entry.name}`;
    deleteBtn.setAttribute('aria-label', `Delete ${entry.kind} ${entry.name}`);
    deleteBtn.onclick = (e) => { 
        e.stopPropagation(); 
        deleteOpfsEntry(projectName, entryPathArray, entry.kind); 
    };
    li.appendChild(deleteBtn);
    parentUlElement.appendChild(li);

    if (entry.kind === 'directory' && expandedFolders[fullPathKey]) {
        await renderChildren(entry, li, projectName, entryPathArray, depth);
    }
}

async function renderChildren(parentEntry, parentLiElement, projectName, parentPathArray, depth) {
    let subList = parentLiElement.querySelector('ul');
    if (!subList) {
        subList = document.createElement('ul');
        parentLiElement.appendChild(subList);
    }
    subList.innerHTML = ''; 
    try {
        let parentDirHandle = rootProjectDirHandle; 
        for (const segment of parentPathArray) {
            parentDirHandle = await parentDirHandle.getDirectoryHandle(segment);
        }
        const childEntries = [];
        for await (const childEntry of parentDirHandle.values()) { childEntries.push(childEntry); }
        childEntries.sort((a,b) => a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'directory' ? -1 : 1);
        for (const childEntry of childEntries) {
            await renderExplorerItem(childEntry, subList, projectName, [...parentPathArray, childEntry.name], depth + 1);
        }
    } catch (err) { 
        console.error(`Error rendering children for ${parentPathArray.join('/')}:`, err); 
        displayEditorMessage(`Error rendering contents of folder ${parentPathArray.join('/')}: ${err.message}`, 'error');
    }
}

async function listOpfsProjectFiles(projectName, basePathArray = []) {
    fileListUl.innerHTML = '';
    if (!navigator.storage || !navigator.storage.getDirectory) {
        displayEditorMessage('OPFS API not supported.', 'error'); return;
    }
    try {
        if (!rootProjectDirHandle) { 
             const opfsRoot = await navigator.storage.getDirectory();
             rootProjectDirHandle = await opfsRoot.getDirectoryHandle(projectName);
        }
        let targetDirHandle = rootProjectDirHandle;
        for (const segment of basePathArray) {
            targetDirHandle = await targetDirHandle.getDirectoryHandle(segment);
        }
        currentDirectoryHandle = targetDirHandle; 
        currentPathSegments = [...basePathArray]; 
        updatePathDisplay();

        if (basePathArray.length > 0) {
            const upLi = document.createElement('li');
            upLi.className = 'up-level item-content'; 
            upLi.setAttribute('tabindex', '0'); // Make focusable
            const iconSpan = document.createElement('span');
            iconSpan.className = 'file-icon';
            iconSpan.textContent = '⬆️ ';
            upLi.appendChild(iconSpan);
            const nameSpan = document.createElement('span');
            nameSpan.textContent = '.. (Up)';
            upLi.appendChild(nameSpan);
            upLi.onclick = () => listOpfsProjectFiles(projectName, basePathArray.slice(0, -1));
            upLi.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    upLi.click();
                }
            });
            fileListUl.appendChild(upLi);
        }
        
        let fileFoundInOpfs = false;
        const opfsEntries = [];
        for await (const entry of currentDirectoryHandle.values()) {
            opfsEntries.push(entry);
            fileFoundInOpfs = true;
        }
        opfsEntries.sort((a,b) => a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'directory' ? -1 : 1);
        for (const entry of opfsEntries) {
            await renderExplorerItem(entry, fileListUl, projectName, [...basePathArray, entry.name], 0);
        }
        if (!fileFoundInOpfs && basePathArray.length === 0) { 
            fileListUl.innerHTML += '<li>No files in this project. Create one!</li>';
        } else if (!fileFoundInOpfs && basePathArray.length > 0) {
             fileListUl.innerHTML += '<li style="font-style: italic; padding-left: 20px;">(Folder is empty)</li>';
        }
    } catch (err) { displayEditorMessage(`Error listing OPFS files: ${err.message}`, 'error'); }
}

async function getHandleFromPath(projectName, itemPathArray, create = false, type = 'file') {
    if (!rootProjectDirHandle) { 
        const opfsRoot = await navigator.storage.getDirectory();
        rootProjectDirHandle = await opfsRoot.getDirectoryHandle(projectName);
    }
    let currentHandle = rootProjectDirHandle;
    for (let i = 0; i < itemPathArray.length - 1 ; i++) {
        currentHandle = await currentHandle.getDirectoryHandle(itemPathArray[i], {create: false}); 
    }
    const itemName = itemPathArray[itemPathArray.length -1];
    if (type === 'file') {
        return await currentHandle.getFileHandle(itemName, {create});
    } else { 
        return await currentHandle.getDirectoryHandle(itemName, {create});
    }
}

async function loadOpfsFileContent(projectName, itemPathArray) {
    const shortFileName = itemPathArray[itemPathArray.length -1];
    if (editor) {
        document.getElementById('monacoEditorContainer').style.display = 'block'; // Show editor
        editor.setValue(`// Loading ${shortFileName} (OPFS)...`);
    }
    try {
        const fileHandle = await getHandleFromPath(projectName, itemPathArray, false, 'file');
        const file = await fileHandle.getFile();
        const content = await file.text();
        if (editor) {
            const model = editor.getModel();
            let language = 'plaintext'; // Default
            const extension = shortFileName.split('.').pop().toLowerCase();

            switch (extension) {
                case 'lua': language = 'lua'; break;
                case 'ini': language = 'ini'; break;
                case 'json': language = 'json'; break;
                case 'html': case 'htm': language = 'html'; break;
                case 'css': language = 'css'; break;
                case 'js': language = 'javascript'; break;
                case 'md': case 'markdown': language = 'markdown'; break;
                case 'xml': language = 'xml'; break;
                case 'py': language = 'python'; break;
                case 'java': language = 'java'; break;
                case 'c': case 'cpp': case 'h': language = 'cpp'; break;
                case 'sh': case 'bash': language = 'shell'; break;
                case 'txt': language = 'plaintext'; break;
            }

            if (model) {
                monaco.editor.setModelLanguage(model, language);
            }
            editor.setValue(content);
        }
        updateCurrentFileDisplay(itemPathArray);
    } catch (err) {
        displayEditorMessage(`Error loading OPFS file ${shortFileName}: ${err.message}`, 'error');
        if (editor) editor.setValue(`// Could not load ${shortFileName} from OPFS.`);
        updateCurrentFileDisplay([]);
    }
}

async function showImageViewer(projectName, imagePathArray) {
    const imageName = imagePathArray[imagePathArray.length - 1];
    try {
        const fileHandle = await getHandleFromPath(projectName, imagePathArray, false, 'file');
        const file = await fileHandle.getFile();

        const modal = document.getElementById('imageViewerModal');
        const modalImg = document.getElementById('modalImageContent');
        const captionText = document.getElementById('imageCaption');
        const closeModalSpan = document.getElementById('closeImageViewer');

        if (modalImg.src && modalImg.src.startsWith('blob:')) {
            URL.revokeObjectURL(modalImg.src);
        }

        const imageUrl = URL.createObjectURL(file);
        modalImg.src = imageUrl;
        captionText.textContent = imageName;
        modal.style.display = 'block';
        document.getElementById('monacoEditorContainer').style.display = 'none'; // Hide editor

        closeModalSpan.onclick = () => { 
            modal.style.display = 'none'; 
            URL.revokeObjectURL(modalImg.src); 
            document.getElementById('monacoEditorContainer').style.display = 'block'; // Show editor
        };
        // Use a named function for the modal click to allow removal if needed later, though not strictly necessary here
        function modalClickListener(event) {
            if (event.target === modal) { 
                modal.style.display = 'none'; 
                URL.revokeObjectURL(modalImg.src); 
                document.getElementById('monacoEditorContainer').style.display = 'block'; // Show editor
            } 
        }
        modal.onclick = modalClickListener;
        updateCurrentFileDisplay(imagePathArray, true); // true indicates it's an image
    } catch (err) {
        displayEditorMessage(`Error displaying image ${imageName}: ${err.message}`, 'error');
        console.error(err);
        document.getElementById('monacoEditorContainer').style.display = 'block'; // Ensure editor is visible on error
    }
}


async function saveOpfsFile(projectName, itemPathArray, fileContent) {
    if (!projectName || itemPathArray.length === 0) {
        displayEditorMessage('Cannot save: No project or file specified.', 'error'); return;
    }
    const shortFileName = itemPathArray[itemPathArray.length - 1];
    try {
        const fileHandle = await getHandleFromPath(projectName, itemPathArray, true, 'file');
        const writable = await fileHandle.createWritable();
        await writable.write(fileContent);
        await writable.close();
        displayEditorMessage(`File '${shortFileName}' saved successfully to OPFS!`, 'success');
    } catch (err) { displayEditorMessage(`Error saving OPFS file ${shortFileName}: ${err.message}`, 'error'); }
}

newFileBtn.addEventListener('click', async () => {
    if (storageType !== 'opfs' || !currentProject || !currentDirectoryHandle) {
        displayEditorMessage('New file: OPFS project & folder must be selected.', 'error'); return;
    }
    const newFileName = prompt('Enter new file name (e.g., script.lua):');
    if (!newFileName || newFileName.trim() === '') return;
    if (newFileName.includes('/') || newFileName.includes('\\') || newFileName === '.' || newFileName === '..') {
        displayEditorMessage('Invalid file name.', 'error'); return;
    }
    try {
        const itemPathArray = [...currentPathSegments, newFileName];
        try { await getHandleFromPath(currentProject, itemPathArray, false, 'file'); 
              displayEditorMessage(`File '${newFileName}' already exists here.`, 'error'); return; } 
        catch (e) { 
            if (e.name !== 'NotFoundError') {
                displayEditorMessage(`Error checking if file '${newFileName}' exists: ${e.message}`, 'error');
                throw e; // Re-throw to be caught by outer try-catch
            }
        }
        
        const newFileHandle = await getHandleFromPath(currentProject, itemPathArray, true, 'file');
        displayEditorMessage(`File '${newFileName}' created.`, 'success');
        // Automatically load the new file into the editor
        loadOpfsFileContent(currentProject, itemPathArray); 
        await listOpfsProjectFiles(currentProject, currentPathSegments); 
    } catch (err) { displayEditorMessage(`Error creating file '${newFileName}': ${err.message}`, 'error'); }
});

newDirectoryBtn.addEventListener('click', async () => {
    if (storageType !== 'opfs' || !currentProject || !currentDirectoryHandle) {
        displayEditorMessage('New directory: OPFS project & folder must be selected.', 'error'); return;
    }
    const newDirName = prompt('Enter new directory name:');
    if (!newDirName || newDirName.trim() === '') return;
    if (newDirName.includes('/') || newDirName.includes('\\') || newDirName === '.' || newDirName === '..') {
        displayEditorMessage('Invalid directory name.', 'error'); return;
    }
    try {
        const itemPathArray = [...currentPathSegments, newDirName];
        try { await getHandleFromPath(currentProject, itemPathArray, false, 'directory');
              displayEditorMessage(`Directory '${newDirName}' already exists here.`, 'error'); return; }
        catch (e) { 
            if (e.name !== 'NotFoundError') {
                displayEditorMessage(`Error checking if directory '${newDirName}' exists: ${e.message}`, 'error');
                throw e; // Re-throw to be caught by outer try-catch
            }
        }
        const newDirHandle = await getHandleFromPath(currentProject, itemPathArray, true, 'directory');
        displayEditorMessage(`Directory '${newDirName}' created.`, 'success');
        await listOpfsProjectFiles(currentProject, currentPathSegments);
    } catch (err) { displayEditorMessage(`Error creating directory '${newDirName}': ${err.message}`, 'error');}
});

async function deleteOpfsEntry(projectName, itemPathArray, itemKind) {
    const itemName = itemPathArray[itemPathArray.length -1];
    if (!confirm(`Are you sure you want to delete ${itemKind} '${itemName}'?`)) return;
    try {
        const parentPathArray = itemPathArray.slice(0, -1);
        let parentDirHandle = rootProjectDirHandle;
        for(const segment of parentPathArray) {
            parentDirHandle = await parentDirHandle.getDirectoryHandle(segment);
        }
        
        await parentDirHandle.removeEntry(itemName, { recursive: itemKind === 'directory' }); 
        displayEditorMessage(`${itemKind} '${itemName}' deleted.`, 'success');
        const deletedFullPathStr = itemPathArray.join('/');
        const currentOpenPathStr = currentOpenFileFullPath.join('/');
        if (deletedFullPathStr === currentOpenPathStr && itemKind === 'file') { 
            updateCurrentFileDisplay([], false); // Clear display, not an image
            if(editor) editor.setValue('// Current file was deleted.');
            document.getElementById('monacoEditorContainer').style.display = 'block'; // Ensure editor is visible
        } else if (itemKind === 'directory' && currentOpenPathStr.startsWith(deletedFullPathStr + '/')) {
            updateCurrentFileDisplay([], false); // Clear display
            if(editor) editor.setValue('// Current file was in a deleted directory.');
            document.getElementById('monacoEditorContainer').style.display = 'block'; // Ensure editor is visible
        }
        await listOpfsProjectFiles(projectName, currentPathSegments); 
    } catch (err) { displayEditorMessage(`Error deleting ${itemKind} '${itemName}': ${err.message}`, 'error'); }
}

uploadFilesBtn.addEventListener('click', () => {
    if (storageType !== 'opfs' || !currentDirectoryHandle) {
        displayEditorMessage('File upload: OPFS project & folder must be selected.', 'error'); return;
    }
    uploadFilesInput.click(); 
});

uploadFilesInput.addEventListener('change', async (event) => {
    const files = event.target.files;
    if (!files.length) return;
    if (!currentDirectoryHandle) {
        displayEditorMessage('Cannot upload: Current OPFS directory not established.', 'error'); return;
    }
    let successCount = 0; let errorCount = 0;
    for (const file of files) {
        try {
            const fileName = file.name;
            try {
                await currentDirectoryHandle.getFileHandle(fileName);
                if (!confirm(`File "${fileName}" already exists in this directory. Overwrite?`)) {
                    displayEditorMessage(`Skipped uploading "${fileName}".`, 'error'); 
                    continue; 
                }
            } catch (e) { if (e.name !== 'NotFoundError') throw e; }
            const fileHandle = await currentDirectoryHandle.getFileHandle(fileName, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(file); 
            await writable.close();
            successCount++;
        } catch (err) {
            errorCount++; console.error(`Error uploading file ${file.name}:`, err);
            displayEditorMessage(`Error uploading ${file.name}: ${err.message}`, 'error');
        }
    }
    if (successCount > 0) displayEditorMessage(`${successCount} file(s) uploaded successfully.`, 'success');
    if (errorCount > 0 && successCount === 0) displayEditorMessage(`${errorCount} file(s) failed to upload.`, 'error');
    else if (errorCount > 0) displayEditorMessage(`Completed with ${successCount} successes and ${errorCount} errors.`, 'error');
    
    await listOpfsProjectFiles(currentProject, currentPathSegments); 
    event.target.value = null; 
});

uploadFolderBtn.addEventListener('click', () => {
    if (storageType !== 'opfs' || !currentDirectoryHandle) {
        displayEditorMessage('Folder upload: OPFS project & folder must be selected.', 'error'); return;
    }
    uploadFolderInput.click();
});

uploadFolderInput.addEventListener('change', async (event) => {
    const files = event.target.files;
    if (!files.length) return;
    if (!currentDirectoryHandle) {
        displayEditorMessage('Cannot upload folder: Current OPFS directory not established.', 'error'); return;
    }
    displayEditorMessage('Starting folder upload... This may take a moment.', 'success');
    let overallSuccess = true;
    const uploadedFolderNames = new Set(); 

    for (const file of files) {
        try {
            const pathSegments = file.webkitRelativePath.split('/').filter(segment => segment !== ''); 
            if (pathSegments.length === 0) continue; 

            const fileName = pathSegments.pop(); 
            let parentDirHandleInOpfs = currentDirectoryHandle; 

            for (const segment of pathSegments) {
                if (segment === '.' || segment === '..') continue; 
                if (pathSegments.indexOf(segment) === 0 && currentPathSegments.length === 0) { 
                    uploadedFolderNames.add(segment);
                }
                parentDirHandleInOpfs = await parentDirHandleInOpfs.getDirectoryHandle(segment, { create: true });
            }
            
            const fileHandleInOpfs = await parentDirHandleInOpfs.getFileHandle(fileName, { create: true });
            const writable = await fileHandleInOpfs.createWritable();
            await writable.write(file); 
            await writable.close();
        } catch (err) {
            console.error(`Error uploading ${file.webkitRelativePath}:`, err);
            displayEditorMessage(`Error with ${file.webkitRelativePath}: ${err.message}`, 'error');
            overallSuccess = false;
        }
    }
    if (overallSuccess) {
        displayEditorMessage('Folder upload completed successfully!', 'success');
    } else {
        displayEditorMessage('Folder upload completed with some errors. Check console.', 'error');
    }
    
    // Expand newly uploaded top-level folders
    uploadedFolderNames.forEach(folderName => {
        const fullPathKey = [...currentPathSegments, folderName].join('/');
        expandedFolders[fullPathKey] = true;
    });

    await listOpfsProjectFiles(currentProject, currentPathSegments); 
    event.target.value = null; 
});


saveButton.addEventListener('click', () => {
  if (storageType === 'opfs') {
      if (currentOpenFileFullPath.length === 0 || !editor || !currentProject) {
          displayEditorMessage('No file selected or project context missing.', 'error'); return;
      }
      // Ensure it's not an image trying to be saved by editor
      const shortFileName = currentOpenFileFullPath[currentOpenFileFullPath.length-1];
      const extension = shortFileName.split('.').pop().toLowerCase();
      if(imageExtensions.includes(extension)){
          displayEditorMessage('Cannot save image with text editor. Upload a new version if needed.', 'error');
          return;
      }
      saveOpfsFile(currentProject, currentOpenFileFullPath, editor.getValue()); 
      return;
  }
  const backendFileName = currentOpenFileFullPath.length > 0 ? currentOpenFileFullPath[currentOpenFileFullPath.length-1] : '';
  if (!currentProject || !backendFileName || !editor) { 
    displayEditorMessage('No file open or editor not ready.', 'error'); return;
  }
  const content = editor.getValue(); 
  fetch(`${API_BASE_URL}/file?project=${encodeURIComponent(currentProject)}&filename=${encodeURIComponent(backendFileName)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: content })
  })
  .then(async r => {
    if (r.ok) {
      return r.json();
    } else {
      // Try to parse as JSON, but fallback to text if not JSON
      const responseText = await r.text();
      try {
        const errorJson = JSON.parse(responseText);
        // Prefer a specific error message field if available, otherwise use the whole object
        throw new Error(errorJson.message || errorJson.error || JSON.stringify(errorJson));
      } catch (jsonParseError) {
        // If it's not JSON, the responseText itself is likely the error message (e.g., HTML error page)
        throw new Error(responseText || 'Unknown backend error');
      }
    }
  })
  .then(d => {
    // This .then() now only processes successful (r.ok) responses
    if (d.message && d.message.toLowerCase().includes('saved')) {
      displayEditorMessage('File saved (backend)!', 'success');
    } else {
      // If r.ok was true, but message is not as expected
      throw new Error(d.message || 'Backend response indicates failure');
    }
  })
  .catch(e => displayEditorMessage(`Save error (backend): ${e.message || 'Unknown error'}`, 'error'));
});

document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  currentProject = params.get('project');
  storageType = params.get('storage') === 'opfs' ? 'opfs' : 'backend'; 

  const opfsSupported = navigator.storage && navigator.storage.getDirectory;
  if (storageType === 'opfs' && !opfsSupported) {
    displayEditorMessage('OPFS API not supported.', 'error');
  }
  newFileBtn.disabled = storageType !== 'opfs' || !opfsSupported;
  newDirectoryBtn.disabled = storageType !== 'opfs' || !opfsSupported;
  uploadFilesBtn.disabled = storageType !== 'opfs' || !opfsSupported; 
  uploadFolderBtn.disabled = storageType !== 'opfs' || !opfsSupported; 

  require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' }});
  require(['vs/editor/editor.main'], async function() { 
      editor = monaco.editor.create(document.getElementById('monacoEditorContainer'), {
          value: '// Select a file or create one.', language: 'plaintext', theme: 'vs-dark', automaticLayout: true 
      });
      window.addEventListener('resize', () => { if (editor) editor.layout(); });
      
      if (currentProject) {
        document.title = `Editor - ${currentProject} (${storageType.toUpperCase()})`;
        if (storageType === 'opfs') {
            if (opfsSupported) {
                try { 
                    const opfsRoot = await navigator.storage.getDirectory();
                    rootProjectDirHandle = await opfsRoot.getDirectoryHandle(currentProject);
                    await listOpfsProjectFiles(currentProject); 
                } catch (err) {
                    displayEditorMessage(`Error accessing project '${currentProject}' in OPFS: ${err.message}`, 'error');
                    fileListUl.innerHTML = '<li>Error loading project from OPFS.</li>';
                }
            } else {  fileListUl.innerHTML = '<li>OPFS Not Supported.</li>'; }
        } else { fetchProjectFilesBackend(currentProject); }
        updateCurrentFileDisplay([]); 
      } else {
        displayEditorMessage('No project specified. Open from dashboard.', 'error');
        fileListUl.innerHTML = '<li>No project loaded.</li>';
        currentPathDisplayElement.textContent = 'No Project'; 
        updateCurrentFileDisplay([]);
        if (editor) editor.setValue('// No project loaded.');
      }
  });
});
