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
    ? '<path d="M112 186 C104 104 144 52 210 42 C281 31 340 74 343 155 L337 278 C332 334 301 376 258 384 L232 344 C210 384 161 375 131 331 C111 301 105 242 112 186Z" fill="' + hair + '"/>'
    : '<path d="M119 178 C114 111 151 65 212 54 C272 43 324 72 337 126 C343 151 337 181 326 207 C313 188 302 171 288 154 C274 168 258 178 239 184 C213 191 180 187 147 176Z" fill="' + hair + '"/>';
  const hairFront = feminine
    ? (pose % 2 === 0
        ? '<path d="M128 171 C129 103 169 67 220 64 C274 61 314 94 320 153 C292 145 273 132 253 111 C244 141 230 163 210 181 C201 158 187 143 169 131 C162 154 148 169 128 184Z" fill="' + hair + '"/>'
        : '<path d="M127 169 C132 102 172 68 222 65 C278 62 315 96 319 153 C291 139 273 125 258 106 C247 137 229 162 207 181 C197 160 182 145 164 135 C158 155 145 170 127 182Z" fill="' + hair + '"/>')
    : (pose % 2 === 0
        ? '<path d="M128 166 C135 108 171 76 218 70 C266 64 307 88 324 132 C303 128 286 119 270 107 C262 128 248 145 229 159 C217 144 204 133 188 125 C179 144 158 159 128 174Z" fill="' + hair + '"/>'
        : '<path d="M129 165 C138 106 176 74 221 69 C269 64 309 89 324 135 C300 129 281 119 265 104 C257 129 241 148 220 162 C210 145 197 134 181 126 C171 145 153 159 129 173Z" fill="' + hair + '"/>');
  const sideHair = feminine
    ? '<path d="M126 153 C113 183 116 233 132 269 C144 254 153 234 157 211 L155 165Z" fill="' + hair + '"/><path d="M317 150 C333 182 332 230 316 270 C301 254 293 232 290 208 L292 163Z" fill="' + hair + '"/>'
    : '<path d="M128 151 C121 174 123 204 134 229 C144 214 150 194 150 174Z" fill="' + hair + '"/><path d="M316 148 C326 171 325 201 315 228 C304 212 298 193 298 171Z" fill="' + hair + '"/>';
  const faceShape = feminine
    ? '<ellipse cx="222" cy="190" rx="94" ry="104" fill="' + skin + '" stroke="#17356f" stroke-width="8"/>'
    : '<path d="M142 151 C147 110 180 85 221 83 C265 81 299 106 306 149 L304 205 C300 243 273 273 223 286 C176 278 146 246 141 207Z" fill="' + skin + '" stroke="#17356f" stroke-width="8"/>';
  const eyes = feminine
    ? '<ellipse cx="185" cy="195" rx="24" ry="30" fill="#fff" stroke="#17356f" stroke-width="7"/><ellipse cx="259" cy="195" rx="24" ry="30" fill="#fff" stroke="#17356f" stroke-width="7"/><ellipse cx="188" cy="201" rx="11" ry="16" fill="#1a9ee8"/><ellipse cx="262" cy="201" rx="11" ry="16" fill="#1a9ee8"/><circle cx="192" cy="195" r="4" fill="#fff"/><circle cx="266" cy="195" r="4" fill="#fff"/>'
    : '<ellipse cx="184" cy="194" rx="20" ry="24" fill="#fff" stroke="#17356f" stroke-width="7"/><ellipse cx="260" cy="194" rx="20" ry="24" fill="#fff" stroke="#17356f" stroke-width="7"/><ellipse cx="187" cy="199" rx="9" ry="13" fill="#1a9ee8"/><ellipse cx="263" cy="199" rx="9" ry="13" fill="#1a9ee8"/><circle cx="190" cy="194" r="3.5" fill="#fff"/><circle cx="266" cy="194" r="3.5" fill="#fff"/>';
  const brows = feminine
    ? ''
    : '<path d="M160 165 Q181 153 201 163 M243 163 Q263 152 284 164" fill="none" stroke="' + hair + '" stroke-width="9" stroke-linecap="round"/><path d="M218 210 Q223 216 228 210" fill="none" stroke="#b67d70" stroke-width="4" stroke-linecap="round"/>';
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
        ${hairBack}
        ${faceShape}
        ${hairFront}
        ${sideHair}
        ${eyes}
        ${brows}
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

export const RAY_ILLUSTRATION = BAND_MEMBER_ILLUSTRATIONS[3];
export const SWEETBERRY_ILLUSTRATION = BAND_MEMBER_ILLUSTRATIONS[6];
export const MAENGGAMJA_ILLUSTRATION = BAND_MEMBER_ILLUSTRATIONS[4];
export const RANDOM_MEMBER_ILLUSTRATIONS = BAND_MEMBER_ILLUSTRATIONS.filter(
  (_, index) => ![3, 6, 4].includes(index),
);
