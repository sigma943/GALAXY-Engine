import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
export default defineConfig({root:fileURLToPath(new URL('.',import.meta.url)),base:'./',publicDir:fileURLToPath(new URL('./public',import.meta.url)),server:{host:'0.0.0.0',port:5173,fs:{allow:[fileURLToPath(new URL('../..',import.meta.url))]}},build:{target:'es2022',outDir:fileURLToPath(new URL('../../dist/demo',import.meta.url)),emptyOutDir:true}});
