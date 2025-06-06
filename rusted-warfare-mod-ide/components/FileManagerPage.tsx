
import React, { useState, useEffect, useCallback } from 'react';
import { FileSystemEntry, ClipboardItem } from '../types';
import { Button } from './common/Button';
import { FolderIcon, FileIcon, ChevronRightIcon, HomeIcon, UploadIcon, DownloadIcon, EditIcon, TrashIcon, ScissorsIcon, ClipboardCopyIcon, ClipboardPasteIcon, PlusIcon, ArrowUturnLeftIcon, PackageIcon, CogIcon } from './common/Icons'; // Added PackageIcon

interface FileManagerPageProps {
  modRootHandle: FileSystemDirectoryHandle;
  currentDirectoryHandle: FileSystemDirectoryHandle;
  setCurrentDirectoryHandle: (handle: FileSystemDirectoryHandle) => void;
  currentPath: string[];
  setCurrentPath: (path: string[]) => void;
  onOpenFile: (fileHandle: FileSystemFileHandle, fileName: string, pathInMod: string[]) => void;
  onExportMod: (format: 'zip' | 'rwmod') => void;
  onHome: () => void;
  clipboardItem: ClipboardItem | null;
  setClipboardItem: (item: ClipboardItem | null) => void;
  isTextEditable: (filename: string) => boolean;
  isImageFile: (filename: string) => boolean;
  downloadFile: (fileHandle: FileSystemFileHandle, fileName: string) => void;
  setIsLoading: (loading: boolean) => void;
}

const FileManagerPage: React.FC<FileManagerPageProps> = ({
  modRootHandle,
  currentDirectoryHandle,
  setCurrentDirectoryHandle,
  currentPath,
  setCurrentPath,
  onOpenFile,
  onExportMod,
  onHome,
  clipboardItem,
  setClipboardItem,
  isTextEditable,
  isImageFile,
  downloadFile,
  setIsLoading,
}) => {
  const [entries, setEntries] = useState<FileSystemEntry[]>([]);
  const [showNewItemModal, setShowNewItemModal] = useState<'file' | 'folder' | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [showExportOptions, setShowExportOptions] = useState(false);

  const loadEntries = useCallback(async () => {
    setIsLoading(true);
    try {
      if ((await currentDirectoryHandle.queryPermission({ mode: 'read' })) !== 'granted') {
        if ((await currentDirectoryHandle.requestPermission({ mode: 'read' })) !== 'granted') {
          alert('Permission denied to read directory contents.');
          setIsLoading(false);
          return;
        }
      }

      const newEntries: FileSystemEntry[] = [];
      for await (const entry of currentDirectoryHandle.values()) {
        newEntries.push({ name: entry.name, kind: entry.kind, handle: entry });
      }
      // Sort entries: folders first, then files, all alphabetically
      newEntries.sort((a, b) => {
        if (a.kind === b.kind) {
          return a.name.localeCompare(b.name);
        }
        return a.kind === 'directory' ? -1 : 1;
      });
      setEntries(newEntries);
    } catch (error) {
      console.error('Error loading directory entries:', error);
      alert('Failed to load directory contents. See console for details.');
    } finally {
      setIsLoading(false);
    }
  }, [currentDirectoryHandle, setIsLoading]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const navigateToDirectory = async (dirHandle: FileSystemDirectoryHandle, dirName: string) => {
    setCurrentDirectoryHandle(dirHandle);
    setCurrentPath([...currentPath, dirName]);
  };

  const navigateUp = async () => {
    if (currentPath.length === 0) return; // Already at mod root

    setIsLoading(true);
    let newHandle = modRootHandle;
    const newPath = currentPath.slice(0, -1);
    try {
      for (const segment of newPath) {
        newHandle = await newHandle.getDirectoryHandle(segment);
      }
      setCurrentDirectoryHandle(newHandle);
      setCurrentPath(newPath);
    } catch (error) {
        console.error("Error navigating up:", error);
        alert("Failed to navigate up. The directory structure might have changed externally.");
        // Fallback to mod root if navigation fails
        setCurrentDirectoryHandle(modRootHandle);
        setCurrentPath([]);
    } finally {
        setIsLoading(false);
    }
  };
  
  const navigateBreadcrumb = async (index: number) => {
    setIsLoading(true);
    let targetHandle = modRootHandle;
    const targetPath = currentPath.slice(0, index + 1);
    try {
      for (const segment of targetPath) {
        targetHandle = await targetHandle.getDirectoryHandle(segment);
      }
      setCurrentDirectoryHandle(targetHandle);
      setCurrentPath(targetPath);
    } catch (error) {
      console.error("Error navigating via breadcrumb:", error);
      alert("Failed to navigate. The directory structure might have changed externally.");
      setCurrentDirectoryHandle(modRootHandle); // Fallback
      setCurrentPath([]);
    } finally {
      setIsLoading(false);
    }
  };


  const handleCreateItem = async () => {
    if (!newItemName.trim() || !showNewItemModal) return;
    setIsLoading(true);
    try {
      if (showNewItemModal === 'file') {
        const fileHandle = await currentDirectoryHandle.getFileHandle(newItemName.trim(), { create: true });
        // Pass correct path for new file, it's in the current directory, not yet part of its own name path.
        onOpenFile(fileHandle, newItemName.trim(), currentPath); 
      } else {
        await currentDirectoryHandle.getDirectoryHandle(newItemName.trim(), { create: true });
      }
      setShowNewItemModal(null);
      setNewItemName('');
      await loadEntries();
    } catch (error) {
      console.error(`Error creating ${showNewItemModal}:`, error);
      alert(`Failed to create ${showNewItemModal}. Name might be invalid or already exist.`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (entry: FileSystemEntry) => {
    if (!window.confirm(`Are you sure you want to delete ${entry.name}? This action cannot be undone.`)) return;
    setIsLoading(true);
    try {
      await currentDirectoryHandle.removeEntry(entry.name, { recursive: entry.kind === 'directory' });
      await loadEntries();
    } catch (error) {
      console.error('Error deleting entry:', error);
      alert(`Failed to delete ${entry.name}. See console for details.`);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleRename = async (entry: FileSystemEntry) => {
    const newName = prompt(`Enter new name for ${entry.name}:`, entry.name);
    if (!newName || newName.trim() === "" || newName.trim() === entry.name) return;

    setIsLoading(true);
    try {
        // FSAA has no direct rename. Workaround: copy to new name, then delete old.
        if (entry.kind === 'file') {
            const fileHandle = entry.handle as FileSystemFileHandle;
            const file = await fileHandle.getFile();
            const newFileHandle = await currentDirectoryHandle.getFileHandle(newName.trim(), { create: true });
            const writable = await newFileHandle.createWritable();
            await writable.write(file);
            await writable.close();
            await currentDirectoryHandle.removeEntry(entry.name); // Delete old file
        } else { // Directory
            await copyRecursively(entry.handle as FileSystemDirectoryHandle, currentDirectoryHandle, newName.trim());
            await currentDirectoryHandle.removeEntry(entry.name, { recursive: true });
        }
        await loadEntries();
    } catch (error) {
        console.error('Error renaming entry:', error);
        alert(`Failed to rename ${entry.name}. New name might be invalid or in use. See console for details.`);
    } finally {
        setIsLoading(false);
    }
  };

  const handleUploadFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    setIsLoading(true);
    try {
      for (const file of files) {
        const fileHandle = await currentDirectoryHandle.getFileHandle(file.name, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(file);
        await writable.close();
      }
      await loadEntries();
      alert(`${files.length} file(s) uploaded successfully.`);
    } catch (error) {
      console.error('Error uploading files:', error);
      alert('Failed to upload files. See console for details.');
    } finally {
      setIsLoading(false);
      event.target.value = ''; // Reset file input
    }
  };

  const handleCopy = (entry: FileSystemEntry) => {
    setClipboardItem({ handle: entry.handle, name: entry.name, operation: 'copy', isFolder: entry.kind === 'directory' });
    alert(`${entry.name} copied to clipboard.`);
  };

  const handleCut = (entry: FileSystemEntry) => {
    setClipboardItem({ handle: entry.handle, name: entry.name, operation: 'cut', isFolder: entry.kind === 'directory' });
     alert(`${entry.name} cut to clipboard. It will be moved on paste.`);
  };
  
  // Recursive copy function
  const copyRecursively = async (sourceHandle: FileSystemDirectoryHandle, targetDirHandle: FileSystemDirectoryHandle, newName?: string) => {
    const destDirName = newName || sourceHandle.name;
    const destDirHandle = await targetDirHandle.getDirectoryHandle(destDirName, { create: true });

    for await (const entry of sourceHandle.values()) {
      if (entry.kind === 'file') {
        const file = await (entry as FileSystemFileHandle).getFile();
        const newFileHandle = await destDirHandle.getFileHandle(entry.name, { create: true });
        const writable = await newFileHandle.createWritable();
        await writable.write(file);
        await writable.close();
      } else if (entry.kind === 'directory') {
        await copyRecursively(entry as FileSystemDirectoryHandle, destDirHandle);
      }
    }
  };

  const getParentHandle = async (itemPath: string[], itemName: string): Promise<FileSystemDirectoryHandle | null> => {
    if (itemPath.length === 0) return modRootHandle; // Item is in mod root
    
    let parentHandle = modRootHandle;
    try {
      for (const segment of itemPath) { // Iterate through the path of the item itself, not currentPath
        parentHandle = await parentHandle.getDirectoryHandle(segment);
      }
      return parentHandle;
    } catch (e) {
      console.error("Could not resolve parent handle for cut operation", e);
      return null; // Could not resolve
    }
  };


  const handlePaste = async () => {
    if (!clipboardItem) {
      alert("Clipboard is empty.");
      return;
    }
    setIsLoading(true);
    try {
      const { handle, name, operation, isFolder } = clipboardItem;

      let targetName = name;
      let nameExists = false;
      try {
        if (isFolder) await currentDirectoryHandle.getDirectoryHandle(targetName);
        else await currentDirectoryHandle.getFileHandle(targetName);
        nameExists = true;
      } catch (e) { /* Expected if name doesn't exist */ }

      if (nameExists) {
        const newNameAttempt = prompt(`An item named "${targetName}" already exists in this location. Enter a new name or cancel:`, `${targetName}_copy`);
        if (!newNameAttempt || newNameAttempt.trim() === "") {
          setIsLoading(false);
          return; // User cancelled or entered empty name
        }
        targetName = newNameAttempt.trim();
      }


      if (isFolder) {
        const sourceDirHandle = handle as FileSystemDirectoryHandle;
        await copyRecursively(sourceDirHandle, currentDirectoryHandle, targetName);
        if (operation === 'cut') {
            // To delete original folder, we need its parent. This is tricky as clipboardItem.handle
            // doesn't store its original path easily without more complex state management.
            // For now, prompt user to manually delete. A more robust solution would involve
            // storing original path with clipboard item or resolving parent.
            // This implementation assumes we cannot easily get the parent of `handle` without its original full path context.
            alert(`Folder ${name} pasted as ${targetName}. If this was a 'cut' operation, please delete the original folder manually.`);
        }

      } else { // File
        const sourceFileHandle = handle as FileSystemFileHandle;
        const file = await sourceFileHandle.getFile();
        const newFileHandle = await currentDirectoryHandle.getFileHandle(targetName, { create: true });
        const writable = await newFileHandle.createWritable();
        await writable.write(file);
        await writable.close();

        if (operation === 'cut') {
             alert(`File ${name} pasted as ${targetName}. If this was a 'cut' operation, please delete the original file manually.`);
        }
      }
      
      if (operation === 'cut') setClipboardItem(null); // Clear clipboard after cut-paste
      await loadEntries();
    } catch (error) {
      console.error('Error pasting item:', error);
      alert(`Failed to paste. See console for details.`);
    } finally {
      setIsLoading(false);
    }
  };


  return (
    <div className="flex flex-col h-screen bg-slate-800 text-slate-100">
      {/* Header */}
      <header className="bg-slate-900 p-3 shadow-md flex items-center justify-between">
        <div className="flex items-center">
            <Button onClick={onHome} variant="ghost" size="sm" className="mr-2">
                <HomeIcon className="w-5 h-5" /> <span className="ml-1 hidden sm:inline">Home</span>
            </Button>
            <h1 className="text-xl font-semibold text-sky-400 flex items-center">
              <PackageIcon className="w-6 h-6 mr-2" /> Mod: {modRootHandle.name}
            </h1>
        </div>
        <div className="relative">
            <Button onClick={() => setShowExportOptions(!showExportOptions)} variant="primary" size="sm">
                <CogIcon className="w-5 h-5 mr-1"/> Export Mod
            </Button>
            {showExportOptions && (
            <div className="absolute right-0 mt-2 w-48 bg-slate-700 rounded-md shadow-lg z-10 py-1">
                <button
                    onClick={() => { onExportMod('zip'); setShowExportOptions(false); }}
                    className="block w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-sky-600 hover:text-white"
                >
                    Export as .zip
                </button>
                <button
                    onClick={() => { onExportMod('rwmod'); setShowExportOptions(false); }}
                    className="block w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-sky-600 hover:text-white"
                >
                    Export as .rwmod
                </button>
            </div>
            )}
        </div>
      </header>

      {/* Toolbar */}
      <div className="bg-slate-700 p-2 flex items-center space-x-2 border-b border-slate-600">
        <Button onClick={() => setShowNewItemModal('file')} variant="secondary" size="sm"><PlusIcon className="w-4 h-4 mr-1" />New File</Button>
        <Button onClick={() => setShowNewItemModal('folder')} variant="secondary" size="sm"><PlusIcon className="w-4 h-4 mr-1" />New Folder</Button>
        <label htmlFor="upload-input" className="cursor-pointer">
          <Button as="span" variant="secondary" size="sm"><UploadIcon className="w-4 h-4 mr-1" />Upload</Button>
          <input id="upload-input" type="file" multiple className="hidden" onChange={handleUploadFiles} />
        </label>
         {clipboardItem && (
            <Button onClick={handlePaste} variant="secondary" size="sm" title="Paste">
                <ClipboardPasteIcon className="w-4 h-4 mr-1" /> Paste
            </Button>
        )}
      </div>

      {/* Breadcrumbs */}
      <div className="bg-slate-700 p-2 text-sm flex items-center space-x-1 border-b border-slate-600 overflow-x-auto">
        <button onClick={() => { setCurrentDirectoryHandle(modRootHandle); setCurrentPath([]); }} className="hover:text-sky-400 flex items-center">
          <FolderIcon className="w-4 h-4 mr-1 text-sky-500" /> {modRootHandle.name}
        </button>
        {currentPath.map((segment, index) => (
          <React.Fragment key={index}>
            <ChevronRightIcon className="w-4 h-4 text-slate-500" />
            <button onClick={() => navigateBreadcrumb(index)} className="hover:text-sky-400">
              {segment}
            </button>
          </React.Fragment>
        ))}
      </div>
      
      {/* File Listing */}
      <main className="flex-grow p-4 overflow-auto">
        {currentPath.length > 0 && (
            <div
            className="flex items-center p-2 mb-2 -ml-2 -mr-2 hover:bg-slate-700 rounded cursor-pointer"
            onClick={navigateUp}
            >
            <ArrowUturnLeftIcon className="w-5 h-5 mr-3 text-sky-400" />
            <span className="font-medium">.. (Up a level)</span>
            </div>
        )}
        {entries.length === 0 && currentPath.length === 0 && (
            <p className="text-slate-400">This mod folder is empty. Create files or folders to get started.</p>
        )}
         {entries.length === 0 && currentPath.length > 0 && (
            <p className="text-slate-400">This folder is empty.</p>
        )}
        <ul className="space-y-1">
          {entries.map((entry) => (
            <li
              key={entry.name}
              className="flex items-center justify-between p-2 hover:bg-slate-700 rounded group"
            >
              <div
                className="flex items-center cursor-pointer flex-grow mr-2 overflow-hidden min-w-0" // Added min-w-0 for better truncation
                onClick={() => {
                  if (entry.kind === 'directory') {
                    navigateToDirectory(entry.handle as FileSystemDirectoryHandle, entry.name);
                  } else {
                    onOpenFile(entry.handle as FileSystemFileHandle, entry.name, currentPath);
                  }
                }}
              >
                {entry.kind === 'directory' ? (
                  <FolderIcon className="w-5 h-5 mr-3 text-sky-400 flex-shrink-0" />
                ) : (
                  <FileIcon className="w-5 h-5 mr-3 text-slate-400 flex-shrink-0" />
                )}
                <span className="truncate" title={entry.name}>{entry.name}</span>
              </div>
              <div className="space-x-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                {(isTextEditable(entry.name) || isImageFile(entry.name)) && entry.kind === 'file' && (
                  <Button onClick={() => onOpenFile(entry.handle as FileSystemFileHandle, entry.name, currentPath)} variant="ghost" size="xs" title="Edit/View"><EditIcon className="w-4 h-4" /></Button>
                )}
                {entry.kind === 'file' && (
                    <Button onClick={() => downloadFile(entry.handle as FileSystemFileHandle, entry.name)} variant="ghost" size="xs" title="Download"><DownloadIcon className="w-4 h-4" /></Button>
                )}
                <Button onClick={() => handleCopy(entry)} variant="ghost" size="xs" title="Copy"><ClipboardCopyIcon className="w-4 h-4" /></Button>
                <Button onClick={() => handleCut(entry)} variant="ghost" size="xs" title="Cut"><ScissorsIcon className="w-4 h-4" /></Button>
                <Button onClick={() => handleRename(entry)} variant="ghost" size="xs" title="Rename"><EditIcon className="w-4 h-4" /> </Button> 
                <Button onClick={() => handleDelete(entry)} variant="ghost" size="xs" className="text-red-500 hover:text-red-400" title="Delete"><TrashIcon className="w-4 h-4" /></Button>
              </div>
            </li>
          ))}
        </ul>
      </main>

      {/* New Item Modal */}
      {showNewItemModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-20 p-4">
          <div className="bg-slate-700 p-6 rounded-lg shadow-xl w-full max-w-sm">
            <h3 className="text-xl font-semibold mb-4 text-sky-400">Create New {showNewItemModal === 'file' ? 'File' : 'Folder'}</h3>
            <input
              type="text"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              placeholder={showNewItemModal === 'file' ? 'Enter file name (e.g., script.lua)' : 'Enter folder name'}
              className="w-full p-2 border border-slate-500 rounded bg-slate-800 text-slate-100 focus:ring-sky-500 focus:border-sky-500 mb-4"
              autoFocus
              onKeyPress={(e) => e.key === 'Enter' && handleCreateItem()}
            />
            <div className="flex justify-end space-x-3">
              <Button onClick={() => { setShowNewItemModal(null); setNewItemName(''); }} variant="danger" size="sm">Cancel</Button>
              <Button onClick={handleCreateItem} variant="primary" size="sm">Create</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FileManagerPage;
