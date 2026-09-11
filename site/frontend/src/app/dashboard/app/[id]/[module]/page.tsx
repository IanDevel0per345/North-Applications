import { ModuleSettingsPage } from "@/components/ui/dashboard/app/ModuleSettingsPage";

export default async function AppModulePage({
  params,
}: {
  params: Promise<{ module: string }>;
}) {
  const { module } = await params;
  return <ModuleSettingsPage moduleId={module} />;
}
