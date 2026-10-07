import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
// A separate entry prevents the production App, auth provider and database client from loading.
export default defineConfig({plugins:[react()],publicDir:false,build:{outDir:'dist-songbook-check',emptyOutDir:true,rollupOptions:{input:'songbook-check.html'}}});
