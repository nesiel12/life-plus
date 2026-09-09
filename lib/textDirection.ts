// Which way a string reads. Used to give a component an explicit `dir` that
// matches its content, independent of any RTL/LTR ancestor.
//
// KineticText lays its per-letter <span>s out in a flex row, so the row's
// direction — not the string — decides visual letter order. In an RTL page an
// English greeting rendered right-to-left as "thgin doog". Setting `dir` from
// the actual first strong character fixes it in either page direction.

const RTL = /[֐-׿؀-ۿ܀-ݏݐ-ݿࢠ-ࣿיִ-﷿ﹰ-﻿]/;
const LTR = /[A-Za-zÀ-ɏͰ-ϿЀ-ӿ]/;

export function textDirection(text: string): "rtl" | "ltr" {
  for (const ch of text) {
    if (RTL.test(ch)) return "rtl";
    if (LTR.test(ch)) return "ltr";
  }
  return "rtl";
}
