"use server";

export const deleteFile = async (_fileUrl: string): Promise<void> => {
  // Los ficheros locales (data-URLs) no requieren borrado remoto en almacenamiento blob.
};
