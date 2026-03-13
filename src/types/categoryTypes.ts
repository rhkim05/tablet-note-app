export interface Category {
  id: string;
  name: string;
  isBuiltIn: boolean;
}

export const BUILT_IN_CATEGORIES: Category[] = [
  { id: 'all',       name: 'All Notes', isBuiltIn: true },
  { id: 'favorites', name: 'Favorites', isBuiltIn: true },
  { id: 'pdfs',      name: 'PDFs',      isBuiltIn: true },
  { id: 'notes',     name: 'Notes',     isBuiltIn: true },
];
