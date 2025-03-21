import { defineCollection, z } from 'astro:content';

const articles = defineCollection({
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.string(), // ✅ Change this to a string
    spotlight: z.boolean().optional(),
  }),
});

export const collections = { articles };
