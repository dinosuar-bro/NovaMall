import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import type { ReactNode } from "react";
import { useRef } from "react";

import { BrandMark } from "../ui/brand-mark.js";

gsap.registerPlugin(useGSAP);

interface AuthShellProps {
  children: ReactNode;
  title: string;
  description: string;
}

export function AuthShell({ children, title, description }: AuthShellProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add({ reduce: "(prefers-reduced-motion: reduce)" }, (context) => {
      const conditions = context.conditions as { reduce?: boolean } | undefined;
      gsap.fromTo(
        ".motion-block",
        { autoAlpha: 1, y: conditions?.reduce === true ? 0 : 10 },
        { autoAlpha: 1, y: 0, duration: conditions?.reduce === true ? 0.01 : 0.22, ease: "power3.out" }
      );
      return () => undefined;
    }, rootRef);
    return () => media.revert();
  }, { scope: rootRef });

  return (
    <main className="auth-shell" ref={rootRef}>
      <section className="brand-panel motion-block" aria-labelledby="brand-title">
        <BrandMark />
        <h1 id="brand-title">把好商品放进清楚的秩序里</h1>
        <p>星选为会员、店主和管理员提供同一套可信入口。先完成认证与角色边界，再逐步开放商品、购物车和订单。</p>
      </section>
      <section className="auth-form motion-block" aria-labelledby="auth-title">
        <h2 id="auth-title">{title}</h2>
        <p>{description}</p>
        {children}
      </section>
    </main>
  );
}
