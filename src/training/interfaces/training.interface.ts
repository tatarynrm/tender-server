/** Запис у storage/training/trainings.json. */
export interface ITrainingVideo {
  id: string;
  topic: string;
  title: string;
  description: string;
  /** Ім'я файлу в папці videos/ — назовні не віддається. */
  fileName: string;
  originalName: string;
  mimeType: string;
  size: number;
  order: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

export type ITrainingVideoPublic = Omit<ITrainingVideo, 'fileName'>;

export interface ITrainingVideoInput {
  topic?: string;
  title?: string;
  description?: string;
  order?: number | string;
}
