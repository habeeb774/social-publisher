import Image from "next/image";

/** The supplied full logo has generous margins; crop presentation, not the asset. */
export function BrandLogo() {
  return <span style={{position:"relative",display:"inline-block",width:176,height:64,flexShrink:0,overflow:"hidden",borderRadius:10,background:"#fff"}}>
    <Image src="/brand/icon-512x512.png" alt="Social Publisher" fill sizes="176px" priority style={{objectFit:"cover",transform:"scale(1.35)"}} />
  </span>;
}
