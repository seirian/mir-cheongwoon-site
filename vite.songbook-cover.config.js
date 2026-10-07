import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';
const local=path=>fileURLToPath(new URL(path,import.meta.url));
// These aliases apply ONLY to this separate noindex preview entry. Production config is untouched.
export default defineConfig({plugins:[react()],publicDir:false,resolve:{alias:[
  {find:/^(?:\.\.\/)+lib\/songbookStore(?:\.js)?$/,replacement:local('./src/songbook-cover/store.js')},
  {find:/^(?:\.\.\/)+components\/songbook\/(?:TimelinePanel|SongEditor|SongDeletion|BulkStatusDialog)(?:\.jsx)?$/,replacement:local('./src/songbook-cover/ReadOnlyBoundaries.jsx')},
]},build:{outDir:'dist-songbook-cover',emptyOutDir:true,rollupOptions:{input:'songbook-cover.html'}}});
