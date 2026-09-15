export interface IDocFolder {
  id: string;
  parentId: string | null;
  name: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

export interface IDocFile {
  id: string;
  folderId: string | null;
  /** Ім'я, яке бачить користувач (з розширенням). */
  name: string;
  /** Ім'я на диску в папці files/ — назовні не віддається. */
  storedName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

export type IDocFilePublic = Omit<IDocFile, 'storedName'>;

/** Вміст storage/documents/documents.json */
export interface IDocumentsDb {
  version: 1;
  folders: IDocFolder[];
  files: IDocFile[];
}
