"use client";

import { Accordion, AccordionItem } from "@heroui/react";

export function FAQ() {
  return (
    <section className="mt-10">
      <div className="flex flex-col gap-4">
        <p className="text-2xl font-bold">Perguntas Frequentes</p>
        <Accordion
          className="bg-foreground/2 p-5 rounded-lg border border-foreground/10 border-dashed focus:outline-none"
          itemClasses={{ title: "text-foreground/90 cursor-pointer" }}
        >
          <AccordionItem key="1" aria-label="Accordion 1" title="Como faço para comprar o plano?" className="focus:outline-none text-sm text-foreground">
            <p>
              Após selecionar o plano desejado, clique no botão "Escolher plano" e siga as instruções para finalizar a compra. Um PIX no valor do plano será gerado e você poderá pagar com o QR Code ou copiando o código de pagamento.
            </p>
          </AccordionItem>
          <AccordionItem key="2" aria-label="Accordion 2" title="Como faço para configurar o bot após a compra?" className="focus:outline-none text-sm text-foreground">
            <p>
              Automáticamente após a compra, o serviço ficará disponível para a configuração na Dashboard. Antes de poder configurar o restante, você precisará informar o token do seu bot.
            </p>
          </AccordionItem>
          <AccordionItem key="3" aria-label="Accordion 3" title="Como faço para renovar o plano?" className="focus:outline-none text-sm text-foreground">
            <p>
              No painel de controle do seu serviço, você irá ver um botão de faturas. Lá, você poderá ver todas as faturas e renovações.
            </p>
          </AccordionItem>
          <AccordionItem key="4" aria-label="Accordion 4" title="É possível cancelar o plano?" className="focus:outline-none text-sm text-foreground">
            <p>
              Não, infelizmente não é possível cancelar o plano. Você poderá pedir reembolso caso tenha problemas com o serviço.
            </p>
          </AccordionItem>
        </Accordion>
      </div>
    </section>
  );
}


