"use client";

import { useRouter } from "next/navigation";

export const AddProjectButton = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const router = useRouter();

  const handleAddProject = () => {
    const uuid = crypto.randomUUID();
    router.push(`/project/${uuid}/add`);
  };

  return (
    <div onClick={handleAddProject} className="cursor-pointer">
      {children}
    </div>
  );
};
