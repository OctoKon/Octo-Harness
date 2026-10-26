import { mount } from 'svelte';
import '@fontsource-variable/geist';
import '@fontsource/crimson-text/400.css';
import '@fontsource/crimson-text/600.css';
import '@fontsource/crimson-text/700.css';
import '@fontsource/crimson-text/400-italic.css';
import '@fontsource/crimson-text/700-italic.css';
import './styles.css';
import App from './App.svelte';

const target = document.getElementById('root');
if (!target) throw new Error('Missing #root');

export default mount(App, { target });
