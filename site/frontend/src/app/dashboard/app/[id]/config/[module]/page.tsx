import { ModuleSettingsPage } from "@/components/ui/dashboard/app/ModuleSettingsPage";

export default async function AppConfigModulePage({
  params,
}: {
  params: Promise<{ module: string }>;
}) {
  const { module } = await params;
  return <ModuleSettingsPage moduleId={module} />;
}
