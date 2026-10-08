export const THEME_KEY = 'ab-theme';

// Runs inline in <head> before first paint, so the page never flashes the other theme:
// a stored choice wins, else the system preference.
export const THEME_INIT =
  "(()=>{let t;try{t=localStorage.getItem('" + THEME_KEY + "')}catch(e){}" +
  "if(t!=='dark'&&t!=='light')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';" +
  'document.documentElement.dataset.theme=t})()';
