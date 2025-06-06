
import React from 'react';
import { Button } from './common/Button';
import { FolderOpenIcon, PlusCircleIcon } from './common/Icons';

interface ModSelectionPageProps {
  onModSelected: (handle: FileSystemDirectoryHandle) => void;
}

const ModSelectionPage: React.FC<ModSelectionPageProps> = ({ onModSelected }) => {
  const handleOpenModDirectory = async () => {
    try {
      // Ensure window.showDirectoryPicker is available (polyfilled or native)
      if (!window.showDirectoryPicker) {
        alert("Your browser does not support the File System Access API. Please use a compatible browser like Chrome or Edge.");
        return;
      }
      const directoryHandle = await window.showDirectoryPicker({ mode: "readwrite" });
      onModSelected(directoryHandle);
    } catch (err) {
      // Error handling for picker cancellation or other issues
      if (err instanceof Error && err.name !== 'AbortError') {
        console.error('Error opening directory:', err);
        alert('Could not open directory. Please ensure you grant permission.');
      }
    }
  };

  const handleCreateNewMod = async () => {
    // For "creating" a new mod, user selects an empty (or new) directory to serve as the mod root.
    // The File System Access API doesn't directly "create" a folder and then return its handle in one step.
    // The user must select it. We instruct them to pick or create one.
    alert("Please select an empty folder for your new mod, or create a new folder and select it.");
    await handleOpenModDirectory(); // Same process, relies on user choosing an appropriate folder.
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-800 p-8">
      <div className="bg-slate-700 p-10 rounded-xl shadow-2xl text-center w-full max-w-md">
        <h1 className="text-4xl font-bold text-sky-400 mb-8">Rusted Warfare Mod IDE</h1>
        <p className="text-slate-300 mb-10">
          Select a mod folder to start editing or create a new mod project.
        </p>
        <div className="space-y-6">
          <Button
            onClick={handleOpenModDirectory}
            variant="primary"
            className="w-full flex items-center justify-center"
          >
            <FolderOpenIcon className="w-6 h-6 mr-3" />
            Open Existing Mod Folder
          </Button>
          <Button
            onClick={handleCreateNewMod}
            variant="secondary"
            className="w-full flex items-center justify-center"
          >
            <PlusCircleIcon className="w-6 h-6 mr-3" />
            Create New Mod Project
          </Button>
        </div>
        <p className="text-xs text-slate-500 mt-12">
          This IDE uses the File System Access API. Your files stay on your computer.
        </p>
      </div>
    </div>
  );
};

export default ModSelectionPage;
