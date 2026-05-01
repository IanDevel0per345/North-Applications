"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCoins, faPuzzlePiece, faTicket, faUsers, faMoneyBill, faGift, faRotate } from "@fortawesome/free-solid-svg-icons";
import { DashboardHeader } from "@/components/ui/dashboard/DashboardHeader";
import { useRequireAdmin } from "@/hooks/useAuth";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loading } from "@/components/Loading";
import dynamic from "next/dynamic";
const UsuariosSection = dynamic(() => import("./sections/usuarios/UsuariosSection").then(m => m.UsuariosSection), { ssr: false });
const CuponsSection = dynamic(() => import("./sections/cupons/CuponsSection").then(m => m.CuponsSection), { ssr: false });
const AplicacoesSection = dynamic(() => import("./sections/AplicacoesSection").then(m => m.AplicacoesSection), { ssr: false });
const PlanosSection = dynamic(() => import("./sections/planos/PlanosSection").then(m => m.PlanosSection), { ssr: false });
const PagamentosSection = dynamic(() => import("./sections/pagamentos/PagamentosSection").then(m => m.PagamentosSection), { ssr: false });
const GiftsSection = dynamic(() => import("./sections/gifts/page"), { ssr: false });
const UpdatesSection = dynamic(() => import("./sections/updates/page"), { ssr: false });
import { AdminLayout } from "@/components/ui/dashboard/admin/AdminLayout";
import { AdminMobileBar } from "@/components/ui/dashboard/admin/AdminMobileBar";
import { AdminSidebar, AdminSidebarOverlay } from "@/components/ui/dashboard/admin/AdminSidebar";

type AdminSection = "usuarios" | "cupons" | "aplicacoes" | "planos" | "pagamentos" | "gifts" | "updates";

function AdminPageContent() {
    const { user, loading } = useRequireAdmin();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [selected, setSelected] = useState<AdminSection>("usuarios");

    const params = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        if (loading) return;
        const tab = params.get("tab");
        if (tab === "usuarios" || tab === "cupons" || tab === "aplicacoes" || tab === "planos" || tab === "pagamentos" || tab === "gifts" || tab === "updates") {
            setSelected(tab);
        }
    }, [loading, params]);

    const handleSelect = (s: AdminSection) => {
        setSelected(s);
        const sp = new URLSearchParams(params.toString());
        sp.set("tab", s);
        router.replace(`${pathname}?${sp.toString()}`);
    };

    const sections: { id: AdminSection; label: string; href?: string; icon: any }[] = [
        { id: "usuarios", label: "Usuários", icon: faUsers },
        { id: "cupons", label: "Cupons", icon: faTicket },
        { id: "aplicacoes", label: "Aplicações", icon: faPuzzlePiece },
        { id: "planos", label: "Planos", icon: faCoins },
        { id: "pagamentos", label: "Pagamentos", icon: faMoneyBill },
        { id: "gifts", label: "Gifts", icon: faGift },
        { id: "updates", label: "Atualizações", icon: faRotate },
    ];

    const title = sections.find((s) => s.id === selected)?.label;

    if (user?.admin) {
        return (
            <main>
                <DashboardHeader user={user} />
                <AdminLayout isLoading={loading}>
                    <AdminMobileBar title={title} onOpen={() => setIsSidebarOpen(true)} />
                    <AdminSidebar sections={sections} selected={selected} onSelect={(s) => handleSelect(s)} />
                    <AdminSidebarOverlay
                        isOpen={isSidebarOpen}
                        onClose={() => setIsSidebarOpen(false)}
                        sections={sections}
                        selected={selected}
                        onSelect={(s) => handleSelect(s)}
                    />
                    <section className="flex-1 min-w-0">
                        {selected === "usuarios" && <UsuariosSection />}
                        {selected === "cupons" && <CuponsSection />}
                        {selected === "aplicacoes" && <AplicacoesSection />}
                        {selected === "planos" && <PlanosSection />}
                        {selected === "pagamentos" && <PagamentosSection />}
                        {selected === "gifts" && <GiftsSection />}
                        {selected === "updates" && <UpdatesSection />}
                    </section>
                </AdminLayout>
                </main>
        );
    } else {
        return <Loading />;
    }
}

export default function AdminPage() {
    return (
        <Suspense fallback={<Loading />}>
            <AdminPageContent />
        </Suspense>
    );
}