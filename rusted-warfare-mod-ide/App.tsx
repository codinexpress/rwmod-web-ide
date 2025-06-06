
import React, { useState, useCallback, useEffect } from 'react';
import { AppView, EditingFile, ClipboardItem } from './types';
import ModSelectionPage from './components/ModSelectionPage';
import FileManagerPage from './components/FileManagerPage';
import TextEditorPage from './components/TextEditorPage';
import ImageViewerPage from './components/ImageViewerPage';
import saveAs from 'file-saver'; // For downloads and exports (changed to default import)
import JSZip from 'jszip';

// Helper to get file extension
const getFileExtension = (filename: string): string => {
  return filename.slice(((filename.lastIndexOf(".") - 1) >>> 0) + 2).toLowerCase();
};

// Helper to determine if a file is likely text-editable
const isTextEditable = (filename: string): boolean => {
  const ext = getFileExtension(filename);
  const textExtensions = ['txt', 'ini', 'lua', 'py', 'json', 'xml', 'md', 'cfg', 'log', 'yaml', 'yml', 'toml', 'sh', 'bat', 'js', 'ts', 'html', 'css', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'go', 'rb', 'php', 'sql'];
  return textExtensions.includes(ext);
};

// Helper to determine if a file is an image
const isImageFile = (filename: string): boolean => {
  const ext = getFileExtension(filename);
  const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico'];
  return imageExtensions.includes(ext);
};

async function addDirectoryToZip(dirHandle: FileSystemDirectoryHandle, zipFolder: JSZip): Promise<void> {
  try {
    // Check permission
    if ((await dirHandle.queryPermission({ mode: 'read' })) !== 'granted') {
      if ((await dirHandle.requestPermission({ mode: 'read' })) !== 'granted') {
        throw new Error(`Permission denied for directory ${dirHandle.name}`);
      }
    }

    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'file') {
        const fileHandle = entry as FileSystemFileHandle;
        const file = await fileHandle.getFile();
        zipFolder.file(entry.name, await file.arrayBuffer());
      } else if (entry.kind === 'directory') {
        const subDirHandle = entry as FileSystemDirectoryHandle;
        const subZipFolder = zipFolder.folder(entry.name);
        if (subZipFolder) {
          await addDirectoryToZip(subDirHandle, subZipFolder);
        }
      }
    }
  } catch (error) {
    console.error(`Error adding directory ${dirHandle.name} to zip:`, error);
    alert(`Error processing directory ${dirHandle.name} for zipping. Some files might be missing from the archive. Check console for details.`);
    // Continue zipping other parts if possible
  }
}


const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<AppView>(AppView.MOD_SELECTION);
  const [modRootHandle, setModRootHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [currentDirectoryHandle, setCurrentDirectoryHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [currentPath, setCurrentPath] = useState<string[]>([]); // Path relative to modRootHandle
  const [editingFile, setEditingFile] = useState<EditingFile | null>(null);
  const [clipboardItem, setClipboardItem] = useState<ClipboardItem | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const navigateToModRoot = useCallback(() => {
    if (modRootHandle) {
      setCurrentDirectoryHandle(modRootHandle);
      setCurrentPath([]);
    }
  }, [modRootHandle]);
  
  useEffect(() => {
    if (modRootHandle && currentView === AppView.FILE_MANAGER) {
      navigateToModRoot();
    }
  }, [modRootHandle, currentView, navigateToModRoot]);


  const handleModSelected = useCallback(async (handle: FileSystemDirectoryHandle) => {
    setIsLoading(true);
    try {
      // Verify permission
      if ((await handle.queryPermission({ mode: 'readwrite' })) !== 'granted') {
        if ((await handle.requestPermission({ mode: 'readwrite' })) !== 'granted') {
          alert('Permission to access the directory was denied.');
          setIsLoading(false);
          return;
        }
      }
      setModRootHandle(handle);
      setCurrentDirectoryHandle(handle);
      setCurrentPath([]);
      setCurrentView(AppView.FILE_MANAGER);
    } catch (error) {
      console.error("Error selecting mod directory:", error);
      alert("Failed to select mod directory. See console for details.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleOpenFile = useCallback((fileHandle: FileSystemFileHandle, fileName: string, pathInMod: string[]) => {
    const fileInfo = { handle: fileHandle, name: fileName, path: pathInMod };
    if (isTextEditable(fileName)) {
      setEditingFile(fileInfo);
      setCurrentView(AppView.TEXT_EDITOR);
    } else if (isImageFile(fileName)) {
      setEditingFile(fileInfo);
      setCurrentView(AppView.IMAGE_VIEWER);
    } else {
      // Offer download for unknown file types
      if (window.confirm(`Unsupported file type: ${fileName}. Would you like to download it?`)) {
        downloadFile(fileHandle, fileName);
      }
    }
  }, []);

  const downloadFile = async (fileHandle: FileSystemFileHandle, fileName: string) => {
    try {
      setIsLoading(true);
      const file = await fileHandle.getFile();
      saveAs(file, fileName);
    } catch (error) {
      console.error('Error downloading file:', error);
      alert(`Failed to download ${fileName}. See console for details.`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCloseEditor = useCallback(() => {
    setEditingFile(null);
    setCurrentView(AppView.FILE_MANAGER);
    // Ensure file manager re-renders with potentially updated CWD if path was involved
    if (modRootHandle) {
        // This logic might need refinement if editor navigation changes currentPath
        setCurrentDirectoryHandle(currentDirectoryHandle || modRootHandle); 
    }
  }, [modRootHandle, currentDirectoryHandle]);

  const handleExportMod = useCallback(async (format: 'zip' | 'rwmod') => {
    if (!modRootHandle) return;
    setIsLoading(true);
    try {
      const zip = new JSZip();
      await addDirectoryToZip(modRootHandle, zip); // Add contents of modRootHandle directly to zip
      
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
      const modName = modRootHandle.name || 'mod';
      const fileName = `${modName}.${format}`;
      saveAs(blob, fileName);
      alert(`Mod exported as ${fileName}`);
    } catch (error) {
      console.error('Error exporting mod:', error);
      alert('Failed to export mod. See console for details.');
    } finally {
      setIsLoading(false);
    }
  }, [modRootHandle]);

  const goHome = () => {
    setModRootHandle(null);
    setCurrentDirectoryHandle(null);
    setCurrentPath([]);
    setEditingFile(null);
    setClipboardItem(null);
    setCurrentView(AppView.MOD_SELECTION);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900">
        <div className="text-xl text-slate-100">Loading...</div>
      </div>
    );
  }

  switch (currentView) {
    case AppView.MOD_SELECTION:
      return <ModSelectionPage onModSelected={handleModSelected} />;
    case AppView.FILE_MANAGER:
      if (!modRootHandle || !currentDirectoryHandle) {
         // Should not happen if logic is correct, redirect to selection
        setCurrentView(AppView.MOD_SELECTION);
        return null;
      }
      return (
        <FileManagerPage
          modRootHandle={modRootHandle}
          currentDirectoryHandle={currentDirectoryHandle}
          setCurrentDirectoryHandle={setCurrentDirectoryHandle}
          currentPath={currentPath}
          setCurrentPath={setCurrentPath}
          onOpenFile={handleOpenFile}
          onExportMod={handleExportMod}
          onHome={goHome}
          clipboardItem={clipboardItem}
          setClipboardItem={setClipboardItem}
          isTextEditable={isTextEditable}
          isImageFile={isImageFile}
          downloadFile={downloadFile}
          setIsLoading={setIsLoading}
        />
      );
    case AppView.TEXT_EDITOR:
      if (!editingFile) return null; // Should not happen
      return (
        <TextEditorPage
          fileHandle={editingFile.handle}
          fileName={editingFile.name}
          onClose={handleCloseEditor}
          setIsLoading={setIsLoading}
        />
      );
    case AppView.IMAGE_VIEWER:
      if (!editingFile) return null; // Should not happen
      return (
        <ImageViewerPage
          fileHandle={editingFile.handle}
          fileName={editingFile.name}
          onClose={handleCloseEditor}
          setIsLoading={setIsLoading}
        />
      );
    default:
      return <ModSelectionPage onModSelected={handleModSelected} />;
  }
};

export default App;
