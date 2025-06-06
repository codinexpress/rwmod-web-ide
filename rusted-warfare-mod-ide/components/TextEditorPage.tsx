
import React, { useState, useEffect, useRef } from 'react';
import Editor, { Monaco } from '@monaco-editor/react';
import { Button } from './common/Button';
import { SaveIcon, ArrowLeftIcon } from './common/Icons';

interface TextEditorPageProps {
  fileHandle: FileSystemFileHandle;
  fileName: string;
  onClose: () => void;
  setIsLoading: (loading: boolean) => void;
}

const getLanguageForFile = (fileName: string): string | undefined => {
  const extension = fileName.slice(((fileName.lastIndexOf(".") - 1) >>> 0) + 2).toLowerCase();
  const map: { [key: string]: string } = {
    js: 'javascript',
    ts: 'typescript',
    json: 'json',
    html: 'html',
    css: 'css',
    md: 'markdown',
    py: 'python',
    lua: 'lua',
    ini: 'ini',
    xml: 'xml',
    yaml: 'yaml',
    yml: 'yaml',
    sh: 'shell',
    bat: 'bat',
    java: 'java',
    c: 'c',
    cpp: 'cpp',
    cs: 'csharp',
    go: 'go',
    rb: 'ruby',
    php: 'php',
    sql: 'sql',
    txt: 'plaintext'
  };
  return map[extension] || 'plaintext';
};

const TextEditorPage: React.FC<TextEditorPageProps> = ({ fileHandle, fileName, onClose, setIsLoading }) => {
  const [content, setContent] = useState<string>('');
  const [initialContent, setInitialContent] = useState<string>('');
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const monacoRef = useRef<Monaco | null>(null);


  useEffect(() => {
    const loadFileContent = async () => {
      setIsLoading(true);
      try {
        const file = await fileHandle.getFile();
        const text = await file.text();
        setContent(text);
        setInitialContent(text);
        setIsDirty(false);
      } catch (error) {
        console.error('Error loading file content:', error);
        alert(`Failed to load ${fileName}. See console for details.`);
        onClose(); // Close editor on load failure
      } finally {
        setIsLoading(false);
      }
    };
    loadFileContent();
  }, [fileHandle, fileName, onClose, setIsLoading]);

  const handleEditorChange = (value: string | undefined) => {
    const newContent = value || '';
    setContent(newContent);
    setIsDirty(newContent !== initialContent);
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      const writable = await fileHandle.createWritable();
      await writable.write(content);
      await writable.close();
      setInitialContent(content);
      setIsDirty(false);
      alert(`${fileName} saved successfully.`);
    } catch (error) {
      console.error('Error saving file:', error);
      alert(`Failed to save ${fileName}. See console for details.`);
    } finally {
      setIsLoading(false);
    }
  };
  
  function handleEditorDidMount(editor: any, monaco: Monaco) { // editor: editor.IStandaloneCodeEditor
    monacoRef.current = monaco;
    // You can now use monacoRef.current for Monaco API calls
  }

  const language = getLanguageForFile(fileName);

  return (
    <div className="flex flex-col h-screen bg-slate-800">
      <header className="bg-slate-900 p-3 shadow-md flex items-center justify-between">
        <div className="flex items-center">
          <Button onClick={onClose} variant="ghost" size="sm" className="mr-3">
            <ArrowLeftIcon className="w-5 h-5" />
            <span className="ml-1 hidden sm:inline">Back to Files</span>
          </Button>
          <h2 className="text-lg font-semibold text-sky-400 truncate" title={fileName}>
            Editing: {fileName} {isDirty ? '*' : ''}
          </h2>
        </div>
        <Button onClick={handleSave} variant="primary" size="sm" disabled={!isDirty}>
          <SaveIcon className="w-5 h-5 mr-1" /> Save
        </Button>
      </header>
      <main className="flex-grow monaco-editor-container bg-slate-800">
        <Editor
          height="100%" // Use 100% of the container defined by CSS
          language={language}
          value={content}
          onChange={handleEditorChange}
          onMount={handleEditorDidMount}
          theme="vs-dark" // Monaco's dark theme
          options={{
            minimap: { enabled: true },
            fontSize: 14,
            wordWrap: 'on',
            automaticLayout: true, // Ensures editor resizes correctly
          }}
        />
      </main>
    </div>
  );
};

export default TextEditorPage;
