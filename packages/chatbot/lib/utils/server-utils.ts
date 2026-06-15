import "server-only"
import fs from "fs";

export const logOnFile = (filename: string, data: unknown) => {
  try {
    fs.writeFileSync(
      filename,
      JSON.stringify(data, null, 2)
    );
  } catch (error) {
    console.error(`Error writing ${filename} to file:`, error);
  }
}
