"use client";

import { Link } from "@heroui/link";
import { footer } from "@/config/footer";
import Image from "next/image";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faExternalLink } from "@fortawesome/free-solid-svg-icons";
import { faDiscord, faGithub, faYoutube } from "@fortawesome/free-brands-svg-icons";
import { siteConfig } from "@/config/site";

export const Footer = () => (
  <footer className="flex flex-col py-10 border-t border-foreground/10 w-full">
    <section className="flex w-full flex-col md:flex-row gap-5 md:gap-20 max-w-7xl mx-auto px-6 md:justify-between">
        <div className="flex flex-col gap-2 md:justify-center">
            <Link href="/" className="flex flex-row gap-2 items-center select-none w-fit">
                <Image src="/vision.png" alt="Logo" height={40} width={40} />
                <div className="flex flex-col leading-tight">
                    <span className="text-foreground/90 font-normal font-sans text-[13px]">
                        Vision
                    </span>
                    <span className="text-foreground/60 font-normal font-sans text-[13px]">
                        Applications
                    </span>
                </div>
            </Link>
            <div className="flex flex-col">
                <p className="text-foreground/60 text-[12px]">© 2025 Todos os direitos reservados</p>
                <p className="text-foreground/60 text-[12px]">CNPJ: {siteConfig.cnpj}</p>
            </div>
            <div className="flex flex-row gap-1">
                <Link href="/socials/discord" className="flex flex-row gap-2 items-center select-none w-fit"><FontAwesomeIcon icon={faDiscord} className="text-[18px] text-foreground" /></Link>
                <Link href="/socials/github" className="flex flex-row gap-2 items-center select-none w-fit"><FontAwesomeIcon icon={faGithub} className="text-[18px] text-foreground" /></Link>
                <Link href="/socials/youtube" className="flex flex-row gap-2 items-center select-none w-fit"><FontAwesomeIcon icon={faYoutube} className="text-[18px] text-foreground" /></Link>
            </div>
        </div>
        <hr className="border-foreground/10 md:hidden" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-5 md:gap-10">
            {footer.map((category, categoryIdx) => (
            <div key={categoryIdx} className="flex flex-col gap-3">
                <span className="text-foreground/70 text-[12px]">{category.category}</span>
                <div key={categoryIdx} className="flex flex-col gap-1">
                    {category.links.map((link, linkIdx) => (
                    <Link
                        key={linkIdx}
                        href={link.href}
                        isExternal={link.external}
                        className="text-foreground hover:underline text-[14px] flex flex-row gap-1 items-center"
                    >
                        {link.label}
                        {link.external && <FontAwesomeIcon icon={faExternalLink} className="text-[10px]" />}
                    </Link>
                    ))}
                </div>
            </div>
            ))}
        </div>
    </section>
  </footer>
);