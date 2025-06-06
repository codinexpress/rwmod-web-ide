// Type definitions for File System Access API
// Based on https://wicg.github.io/file-system-access/
// And an amalgamation of typings from @types/wicg-file-system-access

export {}; // Ensure this is treated as a module.

declare global {
  interface Window {
    showDirectoryPicker(options?: DirectoryPickerOptions): Promise<FileSystemDirectoryHandle>;
    showOpenFilePicker(options?: OpenFilePickerOptions): Promise<FileSystemFileHandle[]>;
    showSaveFilePicker(options?: SaveFilePickerOptions): Promise<FileSystemFileHandle>;
  }

  interface FileSystemHandle {
    readonly kind: 'file' | 'directory';
    readonly name: string;
    isSameEntry(other: FileSystemHandle): Promise<boolean>;
    queryPermission(descriptor?: FileSystemPermissionDescriptor): Promise<PermissionState>;
    requestPermission(descriptor?: FileSystemPermissionDescriptor): Promise<PermissionState>;
  }

  interface FileSystemFileHandle extends FileSystemHandle {
    readonly kind: 'file';
    getFile(): Promise<File>;
    createWritable(options?: FileSystemCreateWritableOptions): Promise<FileSystemWritableFileStream>;
  }

  interface FileSystemDirectoryHandle extends FileSystemHandle {
    readonly kind: 'directory';
    getDirectoryHandle(name: string, options?: FileSystemGetDirectoryOptions): Promise<FileSystemDirectoryHandle>;
    getFileHandle(name: string, options?: FileSystemGetFileOptions): Promise<FileSystemFileHandle>;
    removeEntry(name: string, options?: FileSystemRemoveOptions): Promise<void>;
    resolve(possibleDescendant: FileSystemHandle): Promise<string[] | null>;
    keys(): AsyncIterableIterator<string>;
    values(): AsyncIterableIterator<FileSystemFileHandle | FileSystemDirectoryHandle>;
    entries(): AsyncIterableIterator<[string, FileSystemFileHandle | FileSystemDirectoryHandle]>;
    [Symbol.asyncIterator](): AsyncIterableIterator<[string, FileSystemFileHandle | FileSystemDirectoryHandle]>;
  }
  
  interface FileSystemCreateWritableOptions {
    keepExistingData?: boolean;
  }

  interface FileSystemGetFileOptions {
    create?: boolean;
  }

  interface FileSystemGetDirectoryOptions {
    create?: boolean;
  }

  interface FileSystemRemoveOptions {
    recursive?: boolean;
  }

  interface FileSystemPermissionDescriptor {
    mode?: FileSystemPermissionMode;
    /** For Chrome 102+ / Edge 102+ */
    handle?: FileSystemHandle; // Allow specifying a handle for which to query/request permission
  }

  type FileSystemPermissionMode = 'read' | 'readwrite';

  // Native FS type definitions, including writable streams
  interface FileSystemWritableFileStream extends WritableStream {
    write(data: FileSystemWriteChunkType): Promise<void>;
    seek(position: number): Promise<void>;
    truncate(size: number): Promise<void>;
    close(): Promise<void>; // Added close to be explicit, it's part of WritableStream but good to have
  }

  type FileSystemWriteChunkType = BufferSource | Blob | string | WriteParams;

  interface WriteParams {
    type: 'write' | 'seek' | 'truncate';
    data?: BufferSource | Blob | string;
    position?: number;
    size?: number;
  }
  
  // Picker options
  interface FilePickerOptions {
    types?: FilePickerAcceptType[];
    excludeAcceptAllOption?: boolean;
    /** For Chrome 102+ / Edge 102+ */
    id?: string; // A string specifying the ID of the picker. This ID is used to remember the last directory the user picked.
    /** For Chrome 102+ / Edge 102+ */
    startIn?: WellKnownDirectory | FileSystemHandle; // A FileSystemHandle or a well known directory ("desktop", "documents", etc.) to start the picker in.
  }

  interface OpenFilePickerOptions extends FilePickerOptions {
    multiple?: boolean;
  }

  interface SaveFilePickerOptions extends FilePickerOptions {
    suggestedName?: string;
  }

  interface DirectoryPickerOptions {
     /** For Chrome 102+ / Edge 102+ */
    id?: string;
    /** For Chrome 102+ / Edge 102+ */
    startIn?: WellKnownDirectory | FileSystemHandle;
    /** For Chrome 102+ / Edge 102+ */
    mode?: 'read' | 'readwrite';
  }

  interface FilePickerAcceptType {
    description?: string;
    accept: Record<string, string | string[]>;
  }

  type WellKnownDirectory =
    | "desktop"
    | "documents"
    | "downloads"
    | "music"
    | "pictures"
    | "videos"
    // The following are only supported in Chrome 102+
    | "computer"
    | "pictures.recent" // Placeholder, actual value might differ or not be standardized
    | "documents.recent" // Placeholder
    | "home" // Placeholder
    | "onedrive"; // Placeholder

  // PermissionState is already defined in lib.dom.d.ts for Permissions API,
  // but ensuring it's available for FS context.
  // type PermissionState = 'granted' | 'denied' | 'prompt';
}