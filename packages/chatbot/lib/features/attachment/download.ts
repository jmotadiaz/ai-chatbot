export const downloadFiles = async (options: { url: URL }[]) =>
  Promise.all(options.map(downloadFile));

export const downloadFile = async ({
  url,
}: {
  url: URL;
}): Promise<{ data: Uint8Array; mediaType: string }> => {
  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const mediaType = response.headers.get("content-type") || "";

    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    return {
      data: uint8Array,
      mediaType: mediaType,
    };
  } catch (error) {
    throw new Error(`Error downloading file: ${error}`);
  }
};
