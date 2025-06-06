
export enum AppView {
  MOD_SELECTION,
  FILE_MANAGER,
  TEXT_EDITOR,
  IMAGE_VIEWER,
}

export interface FileSystemEntry {
  name: string;
  kind: 'file' | 'directory';
  handle: FileSystemHandle; // Updated to use global FileSystemHandle
}

export interface EditingFile {
  handle: FileSystemFileHandle; // Updated to use global FileSystemFileHandle
  name: string;
  path: string[]; // Path relative to mod root
}

export interface ClipboardItem {
  handle: FileSystemHandle; // Updated to use global FileSystemHandle
  name: string;
  operation: 'copy' | 'cut';
  isFolder: boolean;
}
