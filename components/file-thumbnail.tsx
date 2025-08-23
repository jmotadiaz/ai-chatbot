import Image from "next/image";

interface FileThumbnailProps {
  url: string;
  mediaType: string;
}

export const FileThumbnail: React.FC<FileThumbnailProps> = ({
  url,
  mediaType,
}) => {
  if (mediaType.startsWith("image/")) {
    return (
      <Image
        src={url}
        width={20}
        height={20}
        className="w-10 h-auto"
        alt="attachment"
      />
    );
  }
  if (mediaType === "application/pdf") {
    return <iframe src={url} width={20} height={20} className="w-10 h-auto" />;
  }

  return null;
};
