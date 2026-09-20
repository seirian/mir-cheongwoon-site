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
  const hairShape = feminine
    ? (pose % 2 === 0
        ? '<path fill-rule="evenodd" d="M110 191 C103 106 145 50 214 39 C286 28 344 72 347 154 L342 286 C339 338 309 380 264 399 C253 374 240 354 224 340 C206 358 194 378 184 400 C140 383 112 341 109 286Z M144 179 C147 145 160 120 179 105 C184 122 193 135 205 145 C211 127 220 112 232 99 C242 117 252 131 267 143 C275 130 284 119 294 112 C300 130 304 150 304 176 L301 206 C296 247 268 272 223 283 C181 274 151 245 145 207Z" fill="' + hair + '"/>'
        : '<path fill-rule="evenodd" d="M110 191 C104 106 147 51 216 40 C288 29 344 74 346 155 L341 288 C337 340 307 381 262 399 C252 374 240 354 223 339 C205 358 193 378 183 400 C140 382 113 340 110 286Z M144 179 C149 145 163 120 182 106 C187 123 196 136 208 146 C214 127 223 112 235 99 C245 117 255 132 269 144 C278 130 287 119 296 113 C301 132 304 151 304 176 L301 206 C296 247 268 272 223 283 C181 274 151 245 145 207Z" fill="' + hair + '"/>')
    : (pose % 2 === 0
        ? '<path fill-rule="evenodd" d="M118 178 C114 109 153 64 214 52 C274 41 326 69 340 125 C346 148 341 181 327 210 C311 198 298 185 286 169 C271 181 253 189 233 192 C201 198 164 191 132 180Z M144 170 C150 136 169 112 194 99 C203 116 214 129 229 140 C240 126 254 114 270 105 C284 119 296 139 301 165 L302 205 C297 244 270 271 223 283 C178 274 151 246 145 207Z" fill="' + hair + '"/>'
        : '<path fill-rule="evenodd" d="M118 178 C115 110 155 65 216 53 C276 42 328 71 341 127 C346 150 340 183 326 211 C310 198 297 185 284 168 C269 181 252 189 232 193 C200 198 164 191 132 180Z M144 170 C150 135 170 111 196 98 C204 116 216 130 230 141 C241 126 255 113 271 104 C285 119 296 139 301 165 L302 205 C297 244 270 271 223 283 C178 274 151 246 145 207Z" fill="' + hair + '"/>');
  const faceShape = feminine
    ? '<ellipse cx="222" cy="190" rx="94" ry="104" fill="' + skin + '" stroke="#17356f" stroke-width="8"/>'
    : '<path d="M142 151 C147 110 180 85 221 83 C265 81 299 106 306 149 L304 205 C300 243 273 273 223 286 C176 278 146 246 141 207Z" fill="' + skin + '" stroke="#17356f" stroke-width="8"/>';
  const eyes = feminine
    ? '<ellipse cx="185" cy="195" rx="24" ry="30" fill="#fff" stroke="#17356f" stroke-width="7"/><ellipse cx="259" cy="195" rx="24" ry="30" fill="#fff" stroke="#17356f" stroke-width="7"/><ellipse cx="188" cy="201" rx="11" ry="16" fill="#1a9ee8"/><ellipse cx="262" cy="201" rx="11" ry="16" fill="#1a9ee8"/><circle cx="192" cy="195" r="4" fill="#fff"/><circle cx="266" cy="195" r="4" fill="#fff"/>'
    : '<ellipse cx="184" cy="194" rx="20" ry="24" fill="#fff" stroke="#17356f" stroke-width="7"/><ellipse cx="260" cy="194" rx="20" ry="24" fill="#fff" stroke="#17356f" stroke-width="7"/><ellipse cx="187" cy="199" rx="9" ry="13" fill="#1a9ee8"/><ellipse cx="263" cy="199" rx="9" ry="13" fill="#1a9ee8"/><circle cx="190" cy="194" r="3.5" fill="#fff"/><circle cx="266" cy="194" r="3.5" fill="#fff"/>';
  const brows = feminine
    ? ''
    : '<path d="M160 165 Q181 153 201 163 M243 163 Q263 152 284 164" fill="none" stroke="' + hair + '" stroke-width="9" stroke-linecap="round"/>';
  const mouth = feminine
    ? '<path d="M205 229 Q224 245 244 228" fill="none" stroke="#8d3b67" stroke-width="7" stroke-linecap="round"/>'
    : '<path d="M207 234 Q224 240 241 233" fill="none" stroke="#7b4854" stroke-width="6" stroke-linecap="round"/>';
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
        ${faceShape}
        ${hairShape}
        ${eyes}
        ${brows}
        ${mouth}
        <path d="M153 300 C183 278 260 277 298 302 L333 486 H108 L142 322Z" fill="#f7fbff" stroke="#17356f" stroke-width="9"/>
        <path d="M177 296 L222 350 L270 295 L291 488 H148Z" fill="#26335e"/>
        <path d="M207 323 L222 350 L239 322 L230 428 L214 428Z" fill="${accent}"/>
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

export const RAY_ILLUSTRATION = BAND_MEMBER_ILLUSTRATIONS[3];
export const SWEETBERRY_ILLUSTRATION = BAND_MEMBER_ILLUSTRATIONS[6];
export const MAENGGAMJA_ILLUSTRATION = BAND_MEMBER_ILLUSTRATIONS[4];
export const RANDOM_MEMBER_ILLUSTRATIONS = BAND_MEMBER_ILLUSTRATIONS.filter(
  (_, index) => ![3, 6, 4].includes(index),
);
