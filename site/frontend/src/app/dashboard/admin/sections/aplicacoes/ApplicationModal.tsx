"use client";

import { useState } from "react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
  Textarea,
  Switch,
  Tabs,
  Tab,
  Card,
  CardBody,
  Chip,
  Divider,
  Code,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faServer,
  faUser,
  faClock,
  faMemory,
  faCode,
  faShieldAlt,
  faDatabase,
  faExclamationTriangle,
  faSave,
  faTrash,
  faRotate,
  faPlay,
  faStop,
  faBan,
  faEye,
  faEyeSlash,
} from "@fortawesome/free-solid-svg-icons";
import { Application } from "@/types/application";

interface ApplicationModalProps {
  application: Application;
  isOpen: boolean;
  onClose: () => void;
  onAction: (action: string, data?: any) => Promise<boolean>;
}

export function ApplicationModal({ application, isOpen, onClose, onAction }: ApplicationModalProps) {
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({
    name: application.name,
    expiresAt: application.expiresAt ? new Date(application.expiresAt).toISOString().split("T")[0] : "",
    isBlocked: application.isBlocked || false,
    canRecover: application.canRecover !== false,
    ram: application.hosting?.ram || 200,
    // Campos do bot
    bot: {
      token: application.bot?.token || "",
      owner: application.bot?.owner || "",
      id: application.bot?.id || "",
      server: application.bot?.server || "",
      perms: application.bot?.perms || [],
    },
    // Campos do plano
    plan: {
      id: application.plan?.id || "",
      name: application.plan?.name || "",
      price: application.plan?.price || 0,
      months: application.plan?.months || 1,
    },
  });
  const [showToken, setShowToken] = useState(false);
  const [newPerm, setNewPerm] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    const updateData = {
      name: formData.name,
      expiresAt: formData.expiresAt,
      isBlocked: formData.isBlocked,
      canRecover: formData.canRecover,
      bot: formData.bot,
      plan: formData.plan,
    };
    const success = await onAction("update", updateData);
    if (success) {
      setEditMode(false);
    }
    setLoading(false);
  };

  const handleAction = async (action: string) => {
    setLoading(true);
    await onAction(action);
    setLoading(false);
  };

  const handleRamChange = async () => {
    setLoading(true);
    await onAction("changeRam", { ram: formData.ram });
    setLoading(false);
  };

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose}
      size="3xl"
      scrollBehavior="inside"
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex justify-between items-center">
              <span>Detalhes da Aplicação</span>
              <div className="flex items-center gap-2">
                {!editMode ? (
                  <Button
                    size="sm"
                    variant="light"
                    onPress={() => setEditMode(true)}
                  >
                    Editar
                  </Button>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="light"
                      onPress={() => setEditMode(false)}
                    >
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      color="primary"
                      onPress={handleSave}
                      isLoading={loading}
                      startContent={<FontAwesomeIcon icon={faSave} />}
                    >
                      Salvar
                    </Button>
                  </>
                )}
              </div>
            </ModalHeader>
            
            <ModalBody>
              <Tabs aria-label="Detalhes">
                <Tab key="general" title="Geral">
                  <Card>
                    <CardBody className="space-y-4">
                      {/* Informações básicas */}
                      <div>
                        <h4 className="font-semibold mb-2">Informações Básicas</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <Input
                            label="Nome"
                            value={editMode ? formData.name : application.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            isReadOnly={!editMode}
                            size="sm"
                          />
                          <Input
                            label="Bot ID"
                            value={application.botID || "-"}
                            isReadOnly
                            size="sm"
                          />
                          <Input
                            label="ID MongoDB"
                            value={application._id}
                            isReadOnly
                            size="sm"
                          />
                          <Input
                            label="Data de Expiração"
                            type="date"
                            value={editMode ? formData.expiresAt : (application.expiresAt ? new Date(application.expiresAt).toISOString().split("T")[0] : "")}
                            onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
                            isReadOnly={!editMode}
                            size="sm"
                          />
                        </div>
                      </div>

                      <Divider />

                      {/* Status */}
                      <div>
                        <h4 className="font-semibold mb-2">Status</h4>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm">Bloqueado</span>
                            <Switch
                              isSelected={editMode ? formData.isBlocked : application.isBlocked}
                              onValueChange={(v) => setFormData({ ...formData, isBlocked: v })}
                              isDisabled={!editMode}
                              size="sm"
                            />
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm">Pode Recuperar</span>
                            <Switch
                              isSelected={editMode ? formData.canRecover : application.canRecover}
                              onValueChange={(v) => setFormData({ ...formData, canRecover: v })}
                              isDisabled={!editMode}
                              size="sm"
                            />
                          </div>
                          {application.isDeleted && (
                            <div className="flex items-center justify-between">
                              <span className="text-sm">Deletado</span>
                              <Chip size="sm" color="danger">
                                {new Date(application.deletedAt!).toLocaleDateString("pt-BR")}
                              </Chip>
                            </div>
                          )}
                        </div>
                      </div>

                      <Divider />

                      {/* Plano */}
                      <div>
                        <h4 className="font-semibold mb-2">Plano</h4>
                        <div className="grid grid-cols-2 gap-3">
                          <Input
                            label="Nome do Plano"
                            value={editMode ? formData.plan.name : (application.plan?.name || "-")}
                            onChange={(e) => setFormData({ ...formData, plan: { ...formData.plan, name: e.target.value } })}
                            isReadOnly={!editMode}
                            size="sm"
                          />
                          <Input
                            label="ID do Plano"
                            value={editMode ? formData.plan.id : (application.plan?.id || "-")}
                            onChange={(e) => setFormData({ ...formData, plan: { ...formData.plan, id: e.target.value } })}
                            isReadOnly={!editMode}
                            size="sm"
                          />
                          <Input
                            label="Preço (R$)"
                            type="number"
                            value={editMode ? String(formData.plan.price) : String(application.plan?.price || 0)}
                            onChange={(e) => setFormData({ ...formData, plan: { ...formData.plan, price: Number(e.target.value) } })}
                            isReadOnly={!editMode}
                            size="sm"
                          />
                          <Input
                            label="Duração (meses)"
                            type="number"
                            value={editMode ? String(formData.plan.months) : String(application.plan?.months || 1)}
                            onChange={(e) => setFormData({ ...formData, plan: { ...formData.plan, months: Number(e.target.value) } })}
                            isReadOnly={!editMode}
                            size="sm"
                          />
                        </div>
                      </div>
                    </CardBody>
                  </Card>
                </Tab>

                <Tab key="hosting" title="Hospedagem">
                  <Card>
                    <CardBody className="space-y-4">
                      <h4 className="font-semibold">Informações da Discloud</h4>
                      
                      {application.hosting ? (
                        <div className="space-y-3">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <Input
                              label="App ID"
                              value={application.hosting.appId || "-"}
                              isReadOnly
                              size="sm"
                            />
                            <Input
                              label="Nome na Discloud"
                              value={application.hosting.name || "-"}
                              isReadOnly
                              size="sm"
                            />
                            <Input
                              label="Status"
                              value={application.hosting.status || "-"}
                              isReadOnly
                              size="sm"
                              endContent={
                                application.discloudStatus && (
                                  <Chip size="sm" color={
                                    application.discloudStatus.container === "online" ? "success" :
                                    application.discloudStatus.container === "offline" ? "danger" :
                                    "warning"
                                  }>
                                    {application.discloudStatus.container}
                                  </Chip>
                                )
                              }
                            />
                            <div>
                              <label className="text-sm text-foreground/60">RAM (MB)</label>
                              <div className="flex items-center gap-2">
                                <Input
                                  type="number"
                                  value={String(editMode ? formData.ram : application.hosting.ram)}
                                  onChange={(e) => setFormData({ ...formData, ram: Number(e.target.value) })}
                                  isReadOnly={!editMode}
                                  size="sm"
                                  min={100}
                                  max={1024}
                                />
                                {editMode && (
                                  <Button
                                    size="sm"
                                    color="primary"
                                    onPress={handleRamChange}
                                    isLoading={loading}
                                  >
                                    Alterar
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>

                          {application.discloudStatus && (
                            <>
                              <Divider />
                              <div>
                                <h5 className="font-medium mb-2">Status Detalhado</h5>
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                  <div>
                                    <span className="text-foreground/60">CPU:</span>
                                    <p>{application.discloudStatus.cpu || "0"}%</p>
                                  </div>
                                  <div>
                                    <span className="text-foreground/60">Memória:</span>
                                    <p>{application.discloudStatus.memory || "0"} MB</p>
                                  </div>
                                  <div>
                                    <span className="text-foreground/60">SSD:</span>
                                    <p>{application.discloudStatus.ssd || "0"} MB</p>
                                  </div>
                                  <div>
                                    <span className="text-foreground/60">Network:</span>
                                    <p>{application.discloudStatus.netIO || "0"} MB</p>
                                  </div>
                                </div>
                              </div>
                            </>
                          )}

                          <Divider />

                          <div>
                            <h5 className="font-medium mb-2">Ações Rápidas</h5>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                color="success"
                                variant="flat"
                                onPress={() => handleAction("restart")}
                                isLoading={loading}
                                startContent={<FontAwesomeIcon icon={faRotate} />}
                              >
                                Reiniciar
                              </Button>
                              
                              {application.hosting.status === "online" ? (
                                <Button
                                  size="sm"
                                  color="danger"
                                  variant="flat"
                                  onPress={() => handleAction("stop")}
                                  isLoading={loading}
                                  startContent={<FontAwesomeIcon icon={faStop} />}
                                >
                                  Parar
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  color="success"
                                  variant="flat"
                                  onPress={() => handleAction("start")}
                                  isLoading={loading}
                                  startContent={<FontAwesomeIcon icon={faPlay} />}
                                >
                                  Iniciar
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <p className="text-foreground/60">Sem informações de hospedagem</p>
                      )}
                    </CardBody>
                  </Card>
                </Tab>

                <Tab key="bot" title="Bot Config">
                  <Card>
                    <CardBody className="space-y-4">
                      <h4 className="font-semibold">Configurações do Bot</h4>
                      
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <label className="text-sm text-foreground/60">Token do Bot</label>
                            <div className="flex items-center gap-2">
                              <Input
                                type={showToken ? "text" : "password"}
                                value={editMode ? formData.bot.token : (application.bot?.token || "")}
                                onChange={(e) => setFormData({ ...formData, bot: { ...formData.bot, token: e.target.value } })}
                                isReadOnly={!editMode}
                                size="sm"
                                placeholder="Token do Discord Bot"
                              />
                              <Button
                                size="sm"
                                variant="light"
                                isIconOnly
                                onPress={() => setShowToken(!showToken)}
                              >
                                <FontAwesomeIcon icon={showToken ? faEyeSlash : faEye} />
                              </Button>
                            </div>
                          </div>
                          <Input
                            label="Owner ID (Discord)"
                            value={editMode ? formData.bot.owner : (application.bot?.owner || "")}
                            onChange={(e) => setFormData({ ...formData, bot: { ...formData.bot, owner: e.target.value } })}
                            isReadOnly={!editMode}
                            size="sm"
                            placeholder="ID do dono no Discord"
                          />
                          <Input
                            label="Bot ID"
                            value={editMode ? formData.bot.id : (application.bot?.id || "")}
                            onChange={(e) => setFormData({ ...formData, bot: { ...formData.bot, id: e.target.value } })}
                            isReadOnly={!editMode}
                            size="sm"
                            placeholder="ID do bot no Discord"
                          />
                          <Input
                            label="Server ID"
                            value={editMode ? formData.bot.server : (application.bot?.server || "")}
                            onChange={(e) => setFormData({ ...formData, bot: { ...formData.bot, server: e.target.value } })}
                            isReadOnly={!editMode}
                            size="sm"
                            placeholder="ID do servidor principal"
                          />
                        </div>

                        <Divider />
                        
                        <div>
                          <h5 className="font-medium mb-2">Permissões (Discord IDs)</h5>
                          {editMode ? (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <Input
                                  value={newPerm}
                                  onChange={(e) => setNewPerm(e.target.value)}
                                  placeholder="Discord ID para adicionar permissão"
                                  size="sm"
                                />
                                <Button
                                  size="sm"
                                  color="primary"
                                  onPress={() => {
                                    if (newPerm && !formData.bot.perms.includes(newPerm)) {
                                      setFormData({
                                        ...formData,
                                        bot: {
                                          ...formData.bot,
                                          perms: [...formData.bot.perms, newPerm]
                                        }
                                      });
                                      setNewPerm("");
                                    }
                                  }}
                                >
                                  Adicionar
                                </Button>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {formData.bot.perms.map((perm: string, idx: number) => (
                                  <Chip
                                    key={idx}
                                    size="sm"
                                    variant="flat"
                                    onClose={() => {
                                      setFormData({
                                        ...formData,
                                        bot: {
                                          ...formData.bot,
                                          perms: formData.bot.perms.filter((_: string, i: number) => i !== idx)
                                        }
                                      });
                                    }}
                                  >
                                    {perm}
                                  </Chip>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {(application.bot?.perms || []).map((perm: string, idx: number) => (
                                <Chip key={idx} size="sm" variant="flat">
                                  {perm}
                                </Chip>
                              ))}
                            </div>
                          )}
                        </div>

                        {application.botConfig && (
                          <>
                            <Divider />
                            <div>
                              <h5 className="font-medium mb-2">Bot Config</h5>
                              <div className="space-y-2 text-sm">
                                <div>
                                  <span className="text-foreground/60">Bot Token:</span>
                                  <Code>{application.botConfig.botToken}</Code>
                                </div>
                                <div>
                                  <span className="text-foreground/60">API URL:</span>
                                  <p>{application.botConfig.apiURL}</p>
                                </div>
                                <div>
                                  <span className="text-foreground/60">Versão:</span>
                                  <p>{application.botConfig.version}</p>
                                </div>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </CardBody>
                  </Card>
                </Tab>

                <Tab key="user" title="Usuário">
                  <Card>
                    <CardBody className="space-y-4">
                      <h4 className="font-semibold">Informações do Proprietário</h4>
                      
                      {application.userId ? (
                        <div className="space-y-3">
                          <div className="flex items-center gap-4">
                            {application.userId.avatar && (
                              <img
                                src={application.userId.avatar}
                                alt={application.userId.username}
                                className="w-16 h-16 rounded-full"
                              />
                            )}
                            <div>
                              <h5 className="font-medium">{application.userId.username || "Usuário"}</h5>
                              <p className="text-sm text-foreground/60">{application.userId.email}</p>
                              <p className="text-xs text-foreground/50">ID: {application.userId._id}</p>
                            </div>
                          </div>

                          <Divider />

                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                              <span className="text-foreground/60">Criado em:</span>
                              <p>{new Date(application.createdAt).toLocaleDateString("pt-BR")}</p>
                            </div>
                            <div>
                              <span className="text-foreground/60">Atualizado em:</span>
                              <p>{new Date(application.updatedAt).toLocaleDateString("pt-BR")}</p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <p className="text-foreground/60">Sem informações do usuário</p>
                      )}
                    </CardBody>
                  </Card>
                </Tab>
              </Tabs>
            </ModalBody>

            <ModalFooter>
              <div className="flex justify-between items-center w-full">
                <div className="flex gap-2">
                  {application.isBlocked ? (
                    <Button
                      color="success"
                      variant="flat"
                      size="sm"
                      onPress={() => handleAction("unblock")}
                      isLoading={loading}
                      startContent={<FontAwesomeIcon icon={faPlay} />}
                    >
                      Desbloquear
                    </Button>
                  ) : (
                    <Button
                      color="warning"
                      variant="flat"
                      size="sm"
                      onPress={() => handleAction("block")}
                      isLoading={loading}
                      startContent={<FontAwesomeIcon icon={faBan} />}
                    >
                      Bloquear
                    </Button>
                  )}
                  
                  <Button
                    color="danger"
                    variant="flat"
                    size="sm"
                    onPress={() => {
                      if (confirm(`Tem certeza que deseja deletar ${application.name}?`)) {
                        handleAction("delete");
                      }
                    }}
                    isLoading={loading}
                    startContent={<FontAwesomeIcon icon={faTrash} />}
                  >
                    Deletar
                  </Button>
                </div>

                <Button color="primary" onPress={onClose}>
                  Fechar
                </Button>
              </div>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
