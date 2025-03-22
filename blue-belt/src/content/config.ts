import { defineCollection, z } from 'astro:content';

const articles = defineCollection({
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.date(), // ✅ FIXED: should be a date
    spotlight: z.boolean().optional(),
  }),
});

export const collections = { articles };
