// The home page's behaviour as one module, so the page loads one small script for all of
// its sections instead of one request per section.
import './hero';
import './stations';
import './catalog';
import './runner';
import { reveal } from './reveal';

// the scale bar's segments are measured off left to right as the bar scrolls in
reveal([...document.querySelectorAll('.scale-bar li')], [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], {
  duration: 560,
  stagger: 70,
});

// each note settles in turn as the sheet scrolls in
reveal([...document.querySelectorAll('.note')], [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], {
  duration: 700,
  stagger: 90,
});
