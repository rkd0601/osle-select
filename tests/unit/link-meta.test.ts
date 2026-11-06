import { describe, it, expect } from "vitest";
import { isFetchableUrl, isPrivateIp, parseLinkMeta } from "@/lib/link-meta";

describe("링크 메타 (§0-l A3)", () => {
  it("og:title · og:image (속성 순서 무관, 엔티티, 상대 주소)", () => {
    const html = `<html><head><title>창 제목</title>
      <meta content="에코퍼 &amp; 크롭 자켓" property="og:title">
      <meta property='og:image' content='/img/a.jpg'></head></html>`;
    expect(parseLinkMeta(html, "https://shop.example.com/p/1")).toEqual({ title: "에코퍼 & 크롭 자켓", image: "https://shop.example.com/img/a.jpg" });
  });
  it("og 없으면 <title>, javascript: 이미지는 버린다", () => {
    expect(parseLinkMeta(`<title> 울  코트 </title><meta name="twitter:image" content="javascript:alert(1)">`, "https://a.com")).toEqual({ title: "울 코트", image: null });
  });
  it("사설·루프백·링크로컬 주소는 막는다", () => {
    for (const ip of ["127.0.0.1", "10.34.103.69", "172.16.0.1", "192.168.0.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
    for (const ip of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"]) expect(isPrivateIp(ip), ip).toBe(false);
  });
  it("http(s)·기본 포트만, localhost·IP 사설 주소 거부", async () => {
    expect(await isFetchableUrl("file:///etc/passwd")).toBe(false);
    expect(await isFetchableUrl("http://localhost:3000/")).toBe(false);
    expect(await isFetchableUrl("http://127.0.0.1/")).toBe(false);
    expect(await isFetchableUrl("http://[::1]/")).toBe(false);
    expect(await isFetchableUrl("https://8.8.8.8:8443/")).toBe(false);
    expect(await isFetchableUrl("https://user:pw@8.8.8.8/")).toBe(false);
    expect(await isFetchableUrl("https://8.8.8.8/")).toBe(true);
  });
});
