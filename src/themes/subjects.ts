/**
 * What the wallpaper shows. The subject is chosen apart from the colour theme —
 * any subject in any theme — and each is placed over the spot the original
 * Arch logo occupies, glowing, so switching changes the shape and nothing else.
 *
 * Two styles, because the artwork comes in two:
 *
 * - Logos — the Arch logo it was drawn with, Tux, the Hyprland logo — are
 *   filled with the theme's logo colour and outlined in white. Tux and the
 *   Hyprland logo are single-path 24×24 icons from Simple Icons (simple-icons
 *   16.32.0, CC0-1.0); Tux is Larry Ewing's, the Hyprland logo hyprwm's.
 * - Drawings — Tom's cat, from his matugen templates
 *   (~/.config/matugen/templates/cat.svg) — are line art, stroked in the
 *   theme's primary exactly as the template strokes it, eyes filled.
 */

import { readPreference, writePreference } from "./preferences";

export const SUBJECTS = [
  { id: "arch", name: "Arch" },
  { id: "tux", name: "Tux" },
  { id: "hyprland", name: "Hyprland" },
  { id: "cat", name: "Cat" },
] as const;

export type SubjectId = (typeof SUBJECTS)[number]["id"];

export const SUBJECT_IDS: readonly SubjectId[] = SUBJECTS.map((s) => s.id);
/** What a first visit shows. The list keeps the Arch logo first all the same. */
export const DEFAULT_SUBJECT: SubjectId = "cat";
export const SUBJECT_KEY = "homepage.wallpaper.v1";

export function isSubjectId(value: unknown): value is SubjectId {
  return typeof value === "string" && (SUBJECT_IDS as readonly string[]).includes(value);
}

export function subjectName(subject: SubjectId): string {
  return SUBJECTS.find((s) => s.id === subject)!.name;
}

export function loadSubject(store?: Storage | null): SubjectId {
  return readPreference(SUBJECT_KEY, isSubjectId, DEFAULT_SUBJECT, store);
}

export function saveSubject(subject: SubjectId, store?: Storage | null): void {
  writePreference(SUBJECT_KEY, subject, store);
}

// ── Artwork ────────────────────────────────────────────────────────────────

// The Arch logo as it was drawn in Inkscape, in the wallpaper's own frame. The
// two copies are offset by a fraction of a unit in the original — the glow
// sits a hair below and right of the crisp one — so both are kept.
const ARCH_GLOW =
  "m 83.126807,191.29634 c 0,0 19.220773,-35.00334 33.337833,-63.37484 1.16226,-2.06625 4.94769,2.60103 11.95668,4.67409 -3.25374,-3.85699 -10.41608,-8.69044 -8.90965,-11.40218 4.65546,-10.90354 9.34271,-19.75838 10.98043,-24.754439 4.20004,12.281569 24.07118,50.538459 36.36948,73.969259 -0.90637,-0.2896 -5.83428,-3.08438 -9.8193,-3.73252 6.09146,4.09989 12.87278,9.50477 12.87278,9.50477 l 8.06913,15.11586 c 0,0 -27.81245,-15.3687 -37.1567,-15.5982 0.85124,-12.4146 -1.91919,-23.80345 -10.3988,-23.84115 -9.85985,-0.0438 -11.33149,17.65896 -9.95495,23.71433 -10.89362,1.2769 -37.346933,15.72502 -37.346933,15.72502 z";
const ARCH =
  "m 83.061457,191.19651 c 0,0 19.220773,-35.00334 33.337833,-63.37484 1.16226,-2.06625 4.94769,2.60103 11.95668,4.67409 -3.25374,-3.85699 -10.41608,-8.69044 -8.90965,-11.40218 4.65546,-10.90354 9.34271,-19.75838 10.98043,-24.754444 4.20004,12.281574 24.07118,50.538464 36.36948,73.969264 -0.90637,-0.2896 -5.83428,-3.08438 -9.8193,-3.73252 6.09146,4.09989 12.87278,9.50477 12.87278,9.50477 l 8.06913,15.11586 c 0,0 -27.81245,-15.3687 -37.1567,-15.5982 0.85124,-12.4146 -1.91919,-23.80345 -10.3988,-23.84115 -9.85985,-0.0438 -11.33149,17.65896 -9.95495,23.71433 -10.89362,1.2769 -37.346933,15.72502 -37.346933,15.72502 z";

const ICONS = {
  tux: "M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.26-.334.699-.058 1.574.267 2.577.2.025.134.063.198.114.333l.003.003c.391.778 1.113 1.132 1.884 1.071.771-.06 1.592-.536 2.257-1.306.631-.765 1.683-1.084 2.378-1.503.348-.199.629-.469.649-.853.023-.4-.2-.811-.714-1.376v-.097l-.003-.003c-.17-.2-.25-.535-.338-.926-.085-.401-.182-.786-.492-1.046h-.003c-.059-.054-.123-.067-.188-.135a.357.357 0 00-.19-.064c.431-1.278.264-2.55-.173-3.694-.533-1.41-1.465-2.638-2.175-3.483-.796-1.005-1.576-1.957-1.56-3.368.026-2.152.236-6.133-3.544-6.139zm.529 3.405h.013c.213 0 .396.062.584.198.19.135.33.332.438.533.105.259.158.459.166.724 0-.02.006-.04.006-.06v.105a.086.086 0 01-.004-.021l-.004-.024a1.807 1.807 0 01-.15.706.953.953 0 01-.213.335.71.71 0 00-.088-.042c-.104-.045-.198-.064-.284-.133a1.312 1.312 0 00-.22-.066c.05-.06.146-.133.183-.198.053-.128.082-.264.088-.402v-.02a1.21 1.21 0 00-.061-.4c-.045-.134-.101-.2-.183-.333-.084-.066-.167-.132-.267-.132h-.016c-.093 0-.176.03-.262.132a.8.8 0 00-.205.334 1.18 1.18 0 00-.09.4v.019c.002.089.008.179.02.267-.193-.067-.438-.135-.607-.202a1.635 1.635 0 01-.018-.2v-.02a1.772 1.772 0 01.15-.768c.082-.22.232-.406.43-.533a.985.985 0 01.594-.2zm-2.962.059h.036c.142 0 .27.048.399.135.146.129.264.288.344.465.09.199.14.4.153.667v.004c.007.134.006.2-.002.266v.08c-.03.007-.056.018-.083.024-.152.055-.274.135-.393.2.012-.09.013-.18.003-.267v-.015c-.012-.133-.04-.2-.082-.333a.613.613 0 00-.166-.267.248.248 0 00-.183-.064h-.021c-.071.006-.13.04-.186.132a.552.552 0 00-.12.27.944.944 0 00-.023.33v.015c.012.135.037.2.08.334.046.134.098.2.166.268.01.009.02.018.034.024-.07.057-.117.07-.176.136a.304.304 0 01-.131.068 2.62 2.62 0 01-.275-.402 1.772 1.772 0 01-.155-.667 1.759 1.759 0 01.08-.668 1.43 1.43 0 01.283-.535c.128-.133.26-.2.418-.2zm1.37 1.706c.332 0 .733.065 1.216.399.293.2.523.269 1.052.468h.003c.255.136.405.266.478.399v-.131a.571.571 0 01.016.47c-.123.31-.516.643-1.063.842v.002c-.268.135-.501.333-.775.465-.276.135-.588.292-1.012.267a1.139 1.139 0 01-.448-.067 3.566 3.566 0 01-.322-.198c-.195-.135-.363-.332-.612-.465v-.005h-.005c-.4-.246-.616-.512-.686-.71-.07-.268-.005-.47.193-.6.224-.135.38-.271.483-.336.104-.074.143-.102.176-.131h.002v-.003c.169-.202.436-.47.839-.601.139-.036.294-.065.466-.065zm2.8 2.142c.358 1.417 1.196 3.475 1.735 4.473.286.534.855 1.659 1.102 3.024.156-.005.33.018.513.064.646-1.671-.546-3.467-1.089-3.966-.22-.2-.232-.335-.123-.335.59.534 1.365 1.572 1.646 2.757.13.535.16 1.104.021 1.67.067.028.135.06.205.067 1.032.534 1.413.938 1.23 1.537v-.043c-.06-.003-.12 0-.18 0h-.016c.151-.467-.182-.825-1.065-1.224-.915-.4-1.646-.336-1.77.465-.008.043-.013.066-.018.135-.068.023-.139.053-.209.064-.43.268-.662.669-.793 1.187-.13.533-.17 1.156-.205 1.869v.003c-.02.334-.17.838-.319 1.35-1.5 1.072-3.58 1.538-5.348.334a2.645 2.645 0 00-.402-.533 1.45 1.45 0 00-.275-.333c.182 0 .338-.03.465-.067a.615.615 0 00.314-.334c.108-.267 0-.697-.345-1.163-.345-.467-.931-.995-1.788-1.521-.63-.4-.986-.87-1.15-1.396-.165-.534-.143-1.085-.015-1.645.245-1.07.873-2.11 1.274-2.763.107-.065.037.135-.408.974-.396.751-1.14 2.497-.122 3.854a8.123 8.123 0 01.647-2.876c.564-1.278 1.743-3.504 1.836-5.268.048.036.217.135.289.202.218.133.38.333.59.465.21.201.477.335.876.335.039.003.075.006.11.006.412 0 .73-.134.997-.268.29-.134.52-.334.74-.4h.005c.467-.135.835-.402 1.044-.7zm2.185 8.958c.037.6.343 1.245.882 1.377.588.134 1.434-.333 1.791-.765l.211-.01c.315-.007.577.01.847.268l.003.003c.208.199.305.53.391.876.085.4.154.78.409 1.066.486.527.645.906.636 1.14l.003-.007v.018l-.003-.012c-.015.262-.185.396-.498.595-.63.401-1.746.712-2.457 1.57-.618.737-1.37 1.14-2.036 1.191-.664.053-1.237-.2-1.574-.898l-.005-.003c-.21-.4-.12-1.025.056-1.69.176-.668.428-1.344.463-1.897.037-.714.076-1.335.195-1.814.12-.465.308-.797.641-.984l.045-.022zm-10.814.049h.01c.053 0 .105.005.157.014.376.055.706.333 1.023.752l.91 1.664.003.003c.243.533.754 1.064 1.189 1.637.434.598.77 1.131.729 1.57v.006c-.057.744-.48 1.148-1.125 1.294-.645.135-1.52.002-2.395-.464-.968-.536-2.118-.469-2.857-.602-.369-.066-.61-.2-.723-.4-.11-.2-.113-.602.123-1.23v-.004l.002-.003c.117-.334.03-.752-.027-1.118-.055-.401-.083-.71.043-.94.16-.334.396-.4.69-.533.294-.135.64-.202.915-.47h.002v-.002c.256-.268.445-.601.668-.838.19-.201.38-.336.663-.336zm7.159-9.074c-.435.201-.945.535-1.488.535-.542 0-.97-.267-1.28-.466-.154-.134-.28-.268-.373-.335-.164-.134-.144-.333-.074-.333.109.016.129.134.199.2.096.066.215.2.36.333.292.2.68.467 1.167.467.485 0 1.053-.267 1.398-.466.195-.135.445-.334.648-.467.156-.136.149-.267.279-.267.128.016.034.134-.147.332a8.097 8.097 0 01-.69.468zm-1.082-1.583V5.64c-.006-.02.013-.042.029-.05.074-.043.18-.027.26.004.063 0 .16.067.15.135-.006.049-.085.066-.135.066-.055 0-.092-.043-.141-.068-.052-.018-.146-.008-.163-.065zm-.551 0c-.02.058-.113.049-.166.066-.047.025-.086.068-.14.068-.05 0-.13-.02-.136-.068-.01-.066.088-.133.15-.133.08-.031.184-.047.259-.005.019.009.036.03.03.05v.02h.003z",
  hyprland: "M13.0998.001c.071.0753.1162.1116.1476.1576.5693.8424 1.13 1.691 1.7078 2.5277.3326.4816.6866.9486 1.0416 1.4141.3433.451.7058.8869 1.0494 1.3378.3975.5215.8003 1.0402 1.1696 1.5813.473.6933.9496 1.388 1.3588 2.1188.348.6213.626 1.285.8919 1.9477.1882.4691.3144.9646.4491 1.4537.0624.2267.0799.4659.1163.6994.0449.2858.1211.5717.1258.8583.0125.7465.0773 1.4954-.0528 2.2386-.1433.8195-.3832 1.6041-.74 2.3609-.3607.7646-.7978 1.4708-1.3328 2.1241-.4848.5921-1.054 1.0812-1.6697 1.5296-.452.329-.93.6085-1.4387.8306-.4577.1996-.9293.3597-1.4148.4951-1.0961.3052-2.2076.3722-3.3269.2934-.6747-.0474-1.3574-.1301-2-.3729-.5284-.1996-1.0606-.3967-1.5657-.6462-.3988-.1968-.781-.4435-1.131-.7183-.4591-.3604-.9097-.7418-1.3072-1.167-.356-.3808-.6644-.8153-.941-1.2587-.2916-.468-.5486-.9629-.7693-1.4687-.2385-.546-.3925-1.121-.518-1.71-.1953-.9164-.1322-1.8336-.0923-2.748.0229-.525.1615-1.0504.2945-1.5634.14-.541.3094-1.0786.5147-1.5983.2057-.5205.4445-1.0324.718-1.5204.3432-.6124.7218-1.2066 1.1121-1.7905.3543-.5304.7372-1.0423 1.1218-1.5513.3098-.41.6477-.7988.9614-1.206.3172-.4116.6224-.8326.9293-1.2522.3247-.4441.652-.8865.9656-1.3385.3979-.5728.781-1.156 1.1753-1.7314.0563-.0823.1383-.1475.2082-.2206.0139.0078.0278.0157.042.0235.003.0631.0082.1262.0082.1893.0004.9386.0053 1.8771-.006 2.8157-.0019.1376-.0578.2905-.1327.4085-.303.4795-.6127.9553-.9403 1.4184-.3105.4388-.6459.8601-.9703 1.289-.2673.3532-.5336.7068-.8027 1.0587-.1868.2441-.3829.4812-.5654.7286-.2552.3465-.5115.6933-.7496 1.0515-.2873.432-.57.8684-.828 1.3179-.1847.3215-.3302.6662-.4845 1.0041-.0856.1875-.1644.3793-.2267.5754-.1105.3479-.199.7026-.3094 1.0505-.3109.9774-.245 1.983-.1754 2.9764.0353.5044.2178 1.0035.3707 1.4933.2142.6858.5817 1.294.9963 1.88.283.4003.6042.762.9675 1.0822.299.263.6238.5051.9649.71.3882.2332.7924.4553 1.2163.6085.4523.1637.9303.2849 1.4073.3451.5678.0717 1.1464.0563 1.72.0834.5325.025 1.049-.0816 1.5659-.1832.6562-.129 1.2558-.412 1.8386-.7222.6969-.3707 1.2826-.8958 1.7955-1.4875.5244-.605.9646-1.285 1.2448-2.0319.2955-.7878.5418-1.603.5044-2.4688-.0203-.468.0053-.939-.0378-1.4041-.0317-.3426-.129-.6813-.2196-1.016-.1062-.3932-.215-.7878-.3622-1.1667-.1465-.3775-.3336-.7396-.5175-1.1014-.163-.3205-.3323-.6388-.5226-.9432a16.5743 16.5743 0 0 0-.7372-1.0848c-.3939-.5311-.8106-1.0451-1.2088-1.5727-.4662-.6177-.9314-1.2362-1.382-1.8654-.3889-.5425-.7596-1.0982-1.1303-1.6536-.0595-.0891-.107-.2064-.108-.3108-.0082-1.0156-.0053-2.0312-.0046-3.0467 0-.0339.0086-.0681.0206-.1583z",
};

/** Line art, as its template draws it: a frame, the group's offset, a stroke width. */
interface Drawing {
  width: number;
  height: number;
  translate: [number, number];
  stroke: number;
  /** `fill="currentColor"` marks the parts that are filled — the cat's eyes. */
  elements: string[];
}

const DRAWINGS: Record<"cat", Drawing> = {
  cat: {
    width: 130.7191,
    height: 134.00444,
    translate: [-8.072492, -9.4651044],
    stroke: 2.0,
    elements: [
      "<path d=\"m 72.791631,74.693851 c -0.431896,5.04021 7.021119,4.336653 6.974809,0\"/>",
      "<path d=\"M 9.2574721,73.045261 C 13.288289,70.436659 17.062412,68.087814 20.417165,66.831339\"/>",
      "<path d=\"m 11.413322,82.683176 c 2.772585,-3.062889 5.766726,-5.263008 8.877028,-6.974807\"/>",
      "<path d=\"m 129.85824,63.914601 c 2.84962,0.146666 5.56168,2.222394 7.73569,4.05807\"/>",
      "<path d=\"m 131.38002,72.030743 c 1.97062,0.906914 3.64743,2.738572 4.94577,5.326215\"/>",
      "<path d=\"M 32.281749,99.894079 C 21.558942,101.39816 -5.3694586,75.583106 18.83102,51.561128 c 0.243545,-3.866694 -6.227978,-62.402676 34.792552,-23.762956 4.668109,-1.871659 10.012292,-3.037016 15.360218,-3.03392 13.886785,-11.538338 10.905775,-1.21569 9.909154,0.496727 3.666731,0.510943 7.106677,1.37477 10.06121,2.537193 37.316726,-48.677612 34.971896,20.624451 34.971896,20.624451 24.73173,13.73911 12.65245,42.185004 -6.99438,49.319338\"/>",
      "<path d=\"m 27.138344,99.54953 c -8.643584,32.9389 7.177546,34.48347 22.319384,37.02989\"/>",
      "<path d=\"m 64.42186,137.59394 c 7.079001,0.47898 13.549214,0.19698 19.275833,-1.01452\"/>",
      "<path d=\"M 99.295899,135.18446 C 115.56041,134.39982 129.11722,126.89187 125.54654,112.231 121.97586,97.570132 123.06018,101.16663 122.6298,94.984201\"/>",
      "<path d=\"m 47.555507,123.77113 c -0.576058,24.92895 20.190748,23.72027 17.627242,3.55081\"/>",
      "<path d=\"m 83.697693,125.80017 c -2.324936,20.21984 17.289067,21.11657 16.23228,-1.52178\"/>",
      "<ellipse cx=\"57.320236\" cy=\"59.095646\" rx=\"5.0725875\" ry=\"5.7066612\" fill=\"currentColor\"/>",
      "<ellipse cx=\"91.795074\" cy=\"58.29578\" rx=\"5.0725875\" ry=\"5.7066612\" fill=\"currentColor\"/>",
      "<path d=\"M 31.323227,41.468402 C 29.64392,28.260153 33.340717,25.636109 42.48292,33.732708 38.597064,35.979357 34.870934,38.545455 31.323227,41.468402 Z\"/>",
      "<path d=\"m 100.31042,33.986337 c 9.35582,-13.837644 10.06261,-7.156808 11.92058,6.721176 -3.61976,-3.124803 -7.62478,-5.286476 -11.92058,-6.721176 z\"/>",
      "<ellipse cx=\"75.327927\" cy=\"101.0079\" rx=\"3.2971818\" ry=\"2.2192569\"/>",
      "<path d=\"m 72.411187,99.676343 c -1.543539,-1.174898 -2.687525,-2.509618 -5.833475,-3.043552 -1.19821,2.242258 -0.780984,4.946069 0.380442,7.862509 1.404117,-0.51641 2.578773,-0.80336 4.945774,-2.28266\"/>",
      "<path d=\"m 78.371477,99.549528 c 2.446939,-2.399856 3.717969,-2.447896 5.199401,-2.916737 1.454689,2.556903 1.285067,4.881759 0.380444,7.101619 -1.90222,-0.45056 -3.423996,-0.60723 -5.326216,-2.02904\"/>",
    ],
  },
};

/*
 * Where the Arch logo sits in the 368×201 wallpaper: centred on x 184, y 98,
 * 69 units tall and 64 wide. Everything else is fitted into a box there — 69
 * tall like the logo, and wider than it, so a subject that is wider than tall
 * is not shrunk to a sliver.
 */
const CENTRE_X = 184.05;
const CENTRE_Y = 98;
const BOX_W = 100;
const BOX_H = 69;

/** The Arch logo's white outline and glow blur, in wallpaper units. */
const OUTLINE = 0.47;
const GLOW = 3.5;

/**
 * Every subject is drawn at 90% of the size the original Arch logo had, which
 * filled more of the screen than a wallpaper's centrepiece wants to. The
 * outline and glow stay as wide as ever — each subject divides them by its
 * own scale — so only the shape gets smaller.
 */
const SUBJECT_SIZE = 0.9;

/** Where every subject is drawn, and how large at most: the fitted box, at `SUBJECT_SIZE`. */
export const SUBJECT_FRAME = {
  x: CENTRE_X,
  y: CENTRE_Y,
  width: BOX_W * SUBJECT_SIZE,
  height: BOX_H * SUBJECT_SIZE,
} as const;

/** Scale and offset that centre a `width`×`height` frame in the box, at `SUBJECT_SIZE`. */
function fit(width: number, height: number): { scale: number; x: number; y: number } {
  const scale = Math.min(BOX_W / width, BOX_H / height) * SUBJECT_SIZE;
  return { scale, x: CENTRE_X - (width * scale) / 2, y: CENTRE_Y - (height * scale) / 2 };
}

/**
 * A blurred copy composited under the crisp one. The blur is in the user
 * units of whatever it filters, so each subject, drawn at its own scale, gets
 * a filter with the blur divided down to glow as wide as the Arch logo does.
 *
 * The region is half the subject's size again on every side. It is measured
 * in fractions of the subject's box, and the original Inkscape margin of ~14%
 * only held for the tall Arch logo: round a wide, flat drawing, 14% of its
 * height is less than the blur's reach, and the glow ends in a hard-edged
 * rectangle.
 */
function glowFilter(id: string, blur: number): string {
  return `<filter id="${id}" style="color-interpolation-filters:sRGB" x="-0.5" y="-0.5" width="2" height="2">
<feGaussianBlur stdDeviation="${blur}" result="blurred"/>
<feGaussianBlur stdDeviation="0.01" in="SourceGraphic" result="crisp"/>
<feComposite in="blurred" in2="crisp" operator="arithmetic" k2="0.5" k3="0.5" result="mixed"/>
<feBlend in2="blurred" mode="normal"/>
</filter>`;
}

/**
 * Where the cat's own coordinates land in the wallpaper, exactly as
 * `subjectMarkup` places its drawing: a point (px, py) of the drawing is at
 * (x + scale · (px + translate[0]), y + scale · (py + translate[1])). `glow` is
 * the glow's blur in wallpaper units. The animated cat (src/cat) draws there.
 */
export function catPlacement(): {
  scale: number;
  x: number;
  y: number;
  translate: readonly [number, number];
  glow: number;
} {
  const { width, height, translate } = DRAWINGS.cat;
  return { ...fit(width, height), translate, glow: GLOW };
}

/** The colours a subject is drawn in: the logos' fill, and the drawings' line. */
export interface SubjectColours {
  logo: string;
  line: string;
}

/** The subject's markup for the wallpaper, glow filter included. */
export function subjectMarkup(subject: SubjectId, { logo, line }: SubjectColours): string {
  if (subject === "arch") {
    // Its own Inkscape placement, shrunk about the point it is centred on.
    // Blur and outline are in the logo's units, so both grow by as much as
    // the logo shrinks, and come out as wide as before.
    const s = SUBJECT_SIZE;
    return `${glowFilter("glow", 5 / s)}
<g transform="translate(${CENTRE_X} ${CENTRE_Y}) scale(${s}) translate(${-CENTRE_X} ${-CENTRE_Y})">
<g transform="matrix(0.7110053,0,0,0.69360562,90.971463,-0.3464117)" fill="${logo}" stroke="#ffffff" stroke-width="${0.665 / s}">
<path filter="url(#glow)" d="${ARCH_GLOW}"/>
<path d="${ARCH}"/>
</g>
</g>`;
  }

  if (subject === "tux" || subject === "hyprland") {
    const { scale, x, y } = fit(24, 24);
    const d = ICONS[subject];
    return `${glowFilter("glow", GLOW / scale)}
<g transform="translate(${x} ${y}) scale(${scale})" fill="${logo}" stroke="#ffffff" stroke-width="${OUTLINE / scale}">
<path filter="url(#glow)" d="${d}"/>
<path d="${d}"/>
</g>`;
  }

  // A drawing: the template's own frame and offset inside the fitted box, its
  // own stroke width scaling with it, and the whole group drawn twice — the
  // first copy blurred into the glow — since a line has no fill to glow from.
  const { width, height, translate, stroke, elements } = DRAWINGS[subject];
  const { scale, x, y } = fit(width, height);
  const art = elements.join("\n");
  const group = (filter: string) =>
    `<g${filter} transform="translate(${x} ${y}) scale(${scale}) translate(${translate[0]} ${translate[1]})" color="${line}" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">
${art}
</g>`;
  return `${glowFilter("glow", GLOW / scale)}
${group(' filter="url(#glow)"')}
${group("")}`;
}
