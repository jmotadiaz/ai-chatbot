declare module "@faker-js/faker" {
  export interface FakerLorem {
    words(count?: number): string;
    paragraph(): string;
  }

  export interface Faker {
    seed(seed: number): void;
    lorem: FakerLorem;
  }

  export const faker: Faker;
}


