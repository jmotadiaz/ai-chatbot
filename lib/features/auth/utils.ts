import { genSaltSync, hashSync } from "bcrypt-ts";

export function generateHashedPassword(password: string) {
  const saltRounds = process.env.NEXT_PUBLIC_ENV === "test" ? 1 : 10;
  const salt = genSaltSync(saltRounds);
  const hash = hashSync(password, salt);

  return hash;
}
