/** Chuẩn hoá bản sạch khi hiển thị reader — tránh đúp ảnh / lộ brief biên tập */

export function prepareReaderContent(
  content: string,
  options: { stripLeadingHeroImage?: boolean; stripHeroBriefSection?: boolean } = {},
) {
  const { stripLeadingHeroImage = true, stripHeroBriefSection = true } = options;
  let body = content;

  if (stripLeadingHeroImage) {
    body = body.replace(/^\s*!\[[^\]]*]\([^)]+\)\s*/m, "").trimStart();
  }

  if (stripHeroBriefSection) {
    body = body
      .replace(
        /\n*-{3,}\s*\n+#{0,3}\s*HERO IMAGE BRIEF[\s\S]*?(?=\n-{3,}\s*$|$)/i,
        "\n",
      )
      .replace(/\n-{3,}\s*$/g, "")
      .trim();
  }

  // Đảm bảo list markdown có dòng trống phía trước (CommonMark ổn định hơn)
  body = body.replace(/([^\n])\n([-*+] |\d+\. )/g, "$1\n\n$2");

  return body;
}
