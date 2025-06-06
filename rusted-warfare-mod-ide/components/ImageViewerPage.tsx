
import React, { useState, useEffect } from 'react';
import { Button } from './common/Button';
import { ArrowLeftIcon } from './common/Icons';

interface ImageViewerPageProps {
  fileHandle: FileSystemFileHandle;
  fileName: string;
  onClose: () => void;
  setIsLoading: (loading: boolean) => void;
}

const ImageViewerPage: React.FC<ImageViewerPageProps> = ({ fileHandle, fileName, onClose, setIsLoading }) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    const loadImage = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const file = await fileHandle.getFile();
        if (!file.type.startsWith('image/')) {
            setError('Selected file is not a recognized image type.');
            setIsLoading(false);
            return;
        }
        objectUrl = URL.createObjectURL(file);
        setImageUrl(objectUrl);
      } catch (err) {
        console.error('Error loading image:', err);
        setError('Failed to load image. The file might be corrupted or inaccessible.');
      } finally {
        setIsLoading(false);
      }
    };

    loadImage();

    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [fileHandle, setIsLoading, fileName]); // Added fileName to dependencies as it's used in error messages, though less critical here.

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-slate-100">
      <header className="bg-slate-700 p-3 shadow-md flex items-center justify-between">
         <div className="flex items-center">
            <Button onClick={onClose} variant="ghost" size="sm" className="mr-3">
                <ArrowLeftIcon className="w-5 h-5" />
                <span className="ml-1 hidden sm:inline">Back to Files</span>
            </Button>
            <h2 className="text-lg font-semibold text-sky-400 truncate" title={fileName}>
                Viewing: {fileName}
            </h2>
        </div>
      </header>
      <main className="flex-grow flex items-center justify-center p-4 overflow-auto">
        {imageUrl && !error && (
          <img src={imageUrl} alt={fileName} className="max-w-full max-h-full object-contain rounded-md shadow-lg" />
        )}
        {error && (
            <div className="text-center p-6 bg-red-800 border border-red-600 rounded-lg">
                <p className="text-xl font-semibold text-red-100">Error Displaying Image</p>
                <p className="text-red-200 mt-2">{error}</p>
            </div>
        )}
        {!imageUrl && !error && (
             <p className="text-slate-400 text-lg">Loading image...</p>
        )}
      </main>
    </div>
  );
};

export default ImageViewerPage;
