const svgDataUri = (svg) => `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;

const roleArtwork = {
  VOCAL: `
    <g transform="translate(310 286)">
      <rect x="-7" y="0" width="14" height="150" rx="7" fill="#e8f7ff"/>
      <circle cx="0" cy="-7" r="27" fill="#f8fbff" stroke="#163a89" stroke-width="9"/>
      <path d="M-15 17 L-36 82" stroke="#e8f7ff" stroke-width="10" stroke-linecap="round"/>
    </g>`,
  DRUMS: `
    <g transform="translate(282 325)" stroke="#163a89" stroke-width="8">
      <ellipse cx="-58" cy="48" rx="50" ry="38" fill="#dff6ff"/>
      <ellipse cx="56" cy="48" rx="50" ry="38" fill="#dff6ff"/>
      <circle cx="0" cy="74" r="57" fill="#f8fbff"/>
      <path d="M-60 -42 L10 35 M65 -48 L-4 33" stroke="#fff5c7" stroke-width="10" stroke-linecap="round"/>
    </g>`,
  BASS: `
    <g transform="translate(278 320) rotate(-18)">
      <path d="M-58 55 C-100 8 -53 -55 -3 -25 C23 -70 79 -44 66 6 C57 51 9 72 -58 55Z" fill="#e8f7ff" stroke="#163a89" stroke-width="9"/>
      <rect x="44" y="-27" width="150" height="21" rx="10" fill="#fff5c7" stroke="#163a89" stroke-width="8"/>
      <circle cx="-6" cy="11" r="10" fill="#1d9bf0"/>
      <path d="M-48 42 L175 -17" stroke="#6fcfff" stroke-width="4"/>
    </g>`,
  GUITAR: `
    <g transform="translate(278 320) rotate(-18)">
      <path d="M-58 55 C-103 13 -63 -55 -12 -29 C11 -73 74 -51 69 3 C64 48 15 76 -58 55Z" fill="#fff5c7" stroke="#163a89" stroke-width="9"/>
      <rect x="42" y="-25" width="150" height="21" rx="10" fill="#e8f7ff" stroke="#163a89" stroke-width="8"/>
      <circle cx="-8" cy="10" r="13" fill="#ffffff" stroke="#163a89" stroke-width="6"/>
      <path d="M-45 40 L174 -15" stroke="#1d9bf0" stroke-width="4"/>
    </g>`,
  KEYBOARD: `
    <g transform="translate(248 352)">
      <rect x="-78" y="-22" width="210" height="82" rx="15" fill="#f7fbff" stroke="#163a89" stroke-width="9"/>
      <g stroke="#79cfff" stroke-width="4">
        <path d="M-46 -18 V56 M-14 -18 V56 M18 -18 V56 M50 -18 V56 M82 -18 V56"/>
      </g>
      <g fill="#163a89">
        <rect x="-34" y="-19" width="17" height="42" rx="3"/><rect x="-2" y="-19" width="17" height="42" rx="3"/>
        <rect x="62" y="-19" width="17" height="42" rx="3"/><rect x="94" y="-19" width="17" height="42" rx="3"/>
      </g>
    </g>`,
};

function buildIllustration({ id, role, accent, accent2, hair, skin, feminine, pose = 0 }) {
  const hairBack = feminine
    ? '<path d="M114 172 C108 72 208 34 294 82 C350 114 361 213 325 306 C303 360 264 379 236 350 C179 391 116 340 111 271Z" fill="' + hair + '"/>'
    : '<path d="M121 179 C121 91 192 53 277 82 C325 99 345 154 325 219 C301 196 284 157 260 135 C223 167 177 174 134 163Z" fill="' + hair + '"/>';
  const fringe = pose % 2 === 0
    ? '<path d="M139 155 C165 85 264 82 309 141 C273 131 248 125 222 105 C197 136 171 151 139 155Z" fill="' + hair + '"/>'
    : '<path d="M137 153 C177 83 271 88 310 146 C276 126 251 115 235 101 C218 132 181 154 137 153Z" fill="' + hair + '"/>';
  const mouth = feminine
    ? '<path d="M205 229 Q224 245 244 228" fill="none" stroke="#8d3b67" stroke-width="7" stroke-linecap="round"/>'
    : '<path d="M207 231 Q225 239 241 229" fill="none" stroke="#8d3b67" stroke-width="6" stroke-linecap="round"/>';
  return svgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 600">
      <defs>
        <linearGradient id="bg${id}" x1="0" y1="0" x2="1" y2="1">
          <stop stop-color="${accent}"/><stop offset="1" stop-color="${accent2}"/>
        </linearGradient>
        <filter id="shadow${id}" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="14" stdDeviation="14" flood-color="#0b2562" flood-opacity=".28"/>
        </filter>
      </defs>
      <rect width="480" height="600" rx="42" fill="url(#bg${id})"/>
      <circle cx="398" cy="82" r="112" fill="#fff" opacity=".15"/>
      <circle cx="55" cy="498" r="145" fill="#fff" opacity=".11"/>
      <path d="M0 430 C100 375 165 505 270 438 C355 384 405 403 480 352 V600 H0Z" fill="#fff" opacity=".13"/>
      <g fill="none" stroke="#fff" opacity=".45" stroke-width="5">
        <path d="M45 95 C82 63 111 77 131 103"/><path d="M365 170 C398 135 429 147 447 174"/>
        <path d="M52 119 C83 96 104 107 119 125"/><path d="M372 194 C400 169 423 178 440 197"/>
      </g>
      <g filter="url(#shadow${id})">
        ${hairBack}
        <ellipse cx="222" cy="190" rx="94" ry="104" fill="${skin}" stroke="#17356f" stroke-width="8"/>
        ${fringe}
        <ellipse cx="185" cy="195" rx="24" ry="30" fill="#fff" stroke="#17356f" stroke-width="7"/>
        <ellipse cx="259" cy="195" rx="24" ry="30" fill="#fff" stroke="#17356f" stroke-width="7"/>
        <ellipse cx="188" cy="201" rx="11" ry="16" fill="#1a9ee8"/><ellipse cx="262" cy="201" rx="11" ry="16" fill="#1a9ee8"/>
        <circle cx="192" cy="195" r="4" fill="#fff"/><circle cx="266" cy="195" r="4" fill="#fff"/>
        ${mouth}
        <path d="M153 300 C183 278 260 277 298 302 L333 486 H108 L142 322Z" fill="#f7fbff" stroke="#17356f" stroke-width="9"/>
        <path d="M177 296 L222 350 L270 295 L291 488 H148Z" fill="#26335e"/>
        <path d="M207 323 L222 350 L239 322 L230 428 L214 428Z" fill="${accent}"/>
        <path d="M142 327 C100 352 82 385 69 425" stroke="#f7fbff" stroke-width="50" stroke-linecap="round"/>
        <path d="M300 328 C344 349 360 380 373 417" stroke="#f7fbff" stroke-width="50" stroke-linecap="round"/>
        ${roleArtwork[role]}
      </g>
      <g transform="translate(32 515)">
        <rect width="416" height="58" rx="29" fill="#0e2c72" opacity=".86"/>
        <text x="24" y="39" fill="#fff" font-family="Arial, sans-serif" font-weight="800" font-size="25" letter-spacing="3">${role}</text>
        <text x="392" y="38" text-anchor="end" fill="#cdefff" font-family="Arial, sans-serif" font-weight="700" font-size="14" letter-spacing="2">CHEONGWOON</text>
      </g>
      <g fill="#fff">
        <path d="M72 66 l8 18 18 8-18 8-8 18-8-18-18-8 18-8z" opacity=".9"/>
        <path d="M389 258 l6 13 13 6-13 6-6 13-6-13-13-6 13-6z" opacity=".72"/>
      </g>
    </svg>`);
}

export const BAND_MEMBER_ILLUSTRATIONS = [
  buildIllustration({ id: 1, role: 'VOCAL', accent: '#42c8ff', accent2: '#5169e9', hair: '#20233f', skin: '#ffe7dc', feminine: true, pose: 0 }),
  buildIllustration({ id: 2, role: 'DRUMS', accent: '#47a7ff', accent2: '#745fe7', hair: '#3a2f55', skin: '#f5d8c5', feminine: false, pose: 1 }),
  buildIllustration({ id: 3, role: 'BASS', accent: '#62d7e9', accent2: '#3f6fe5', hair: '#27385e', skin: '#ffe0d4', feminine: true, pose: 1 }),
  buildIllustration({ id: 4, role: 'GUITAR', accent: '#5cc9ff', accent2: '#6657dc', hair: '#18284c', skin: '#f1d3c2', feminine: false, pose: 0 }),
  buildIllustration({ id: 5, role: 'KEYBOARD', accent: '#57d4ff', accent2: '#5267dc', hair: '#41436a', skin: '#ffe4da', feminine: true, pose: 0 }),
  buildIllustration({ id: 6, role: 'DRUMS', accent: '#48b7f2', accent2: '#6558e6', hair: '#1f3558', skin: '#f4d3c2', feminine: true, pose: 1 }),
  buildIllustration({ id: 7, role: 'BASS', accent: '#69d3ff', accent2: '#4d65d6', hair: '#343052', skin: '#f2d5c7', feminine: false, pose: 0 }),
  buildIllustration({ id: 8, role: 'KEYBOARD', accent: '#55c8ff', accent2: '#705ee7', hair: '#242949', skin: '#ffe3d8', feminine: true, pose: 1 }),
];
