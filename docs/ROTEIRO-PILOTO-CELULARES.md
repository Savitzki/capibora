# Piloto físico de notificações e PWA

Preparado em 24/10/2026. **Todos os testes físicos abaixo estão pendentes.** Os testes automatizados em Chromium desktop não comprovam entrega, som, vibração, teclado ou comportamento de suspensão em um celular real.

Usar contas sintéticas autorizadas, duas instalações e um ambiente de homologação com as mesmas migrações e funções da versão candidata. Registrar modelo, versão do sistema/navegador, versão do app, fuso da conta, horário previsto, horário recebido e resultado. Não copiar tokens, assinaturas push nem dados pessoais para o relatório. Não enviar notificações para usuários reais.

## Plataformas

| Plataforma | Preparação | Situação |
| --- | --- | --- |
| Android com Chrome | Abrir em HTTPS; testar aba e PWA instalada; conferir permissões do site e do sistema. | Pendente em aparelho físico |
| iPhone com iOS compatível com Web Push (16.4+) | Instalar pelo Safari na Tela de Início e abrir pelo ícone; conferir permissões e modos Foco. | Pendente em aparelho físico |

## Matriz de execução

Executar cada linha nas duas plataformas. Para entrega Web Push, usar as **janelas existentes de 6h, 8h, 10h, horário salvo e 21h**, sem adicionar Cron, mudar VAPID ou criar disparos diários. Se o horário salvo coincidir com outra janela, verificar deduplicação.

| Caso | Procedimento | Resultado esperado | Execução física |
| --- | --- | --- | --- |
| App aberto, permissão concedida | Aceitar o convite e aguardar uma janela com treino pendente. | Uma entrega elegível por assinatura/janela; o aviso interno não deve causar modais sobrepostas. | Pendente |
| Segundo plano | Manter a PWA instalada em segundo plano e aguardar a janela. | Conferir entrega e eventual atraso imposto pelo sistema. Registrar o observado, sem presumir pontualidade. | Pendente |
| App fechado | Fechar todas as janelas e aguardar uma janela elegível. | Web Push pode chegar sem o app aberto, se sistema/rede permitirem. Lembrete local não depende de execução em segundo plano garantida. | Pendente |
| Permissão negada | Negar a solicitação; navegar e reabrir. | Navegação funciona, sem repetir a solicitação a cada visita nem registrar assinatura válida indevidamente. | Pendente |
| Permissão revogada | Inscrever, revogar no sistema e voltar ao app. | Exibir o estado compatível com o navegador; não prometer entrega. Assinatura expirada deve ser desativada no fluxo existente. | Pendente |
| Silencioso/Foco/economia de bateria | Repetir recebimento com esses modos ativos e depois desativados. | Registrar atraso/ausência de som conforme o sistema; o app não deve prometer contornar esses modos. | Pendente |
| Vibração | Repetir com vibração do sistema ligada e desligada. | Registrar suporte observado. **Não há garantia de vibração no iPhone nem em todas as combinações Android/Chrome.** | Pendente |
| Clique em lembrete de treino | Tocar com app fechado, aberto e em segundo plano. | Abrir/focar o Capibora na subpasta correta, sem múltiplas janelas desnecessárias. | Pendente |
| Clique em peso/grupo/provocação | Usar apenas os fluxos existentes com contas sintéticas. | Abrir o destino previsto; provocação não se repete após recibo confirmado. Uma modal por vez. | Pendente |
| Dois dispositivos | Mesma conta inscrita nos dois; aguardar a mesma janela. | Pode existir uma entrega por instalação: isso é distribuição por dispositivo, não nova cadência. Reexecutar o mesmo trabalho não duplica a entrega na mesma assinatura. | Pendente |
| Treino confirmado antes do envio | Confirmar online em um aparelho antes do despacho e observar o outro. | A revalidação final não autoriza cobrança de treino que já consta confirmado. | Pendente |
| Descanso, Kit e reagendamento | Preparar separadamente cada estado elegível/protegido no servidor. | Não cobrar treino protegido; não conceder proteção apenas por estado local. | Pendente |
| Cronômetro ativo | Iniciar online antes da janela e consultar pelo outro aparelho. | Suprimir a cobrança conforme a elegibilidade oficial; finalizar/cancelar preserva as regras atuais. | Pendente |
| Sem rede e reconexão | Preencher manual e guardar peso offline; reconectar. | Sem sucesso antecipado; mesmos IDs na retentativa; pesos e recompensa não duplicam. | Pendente |
| Meia-noite | Iniciar cronômetro a menos de 35 minutos da virada; enviar manual atrasado em outro caso. | Orientação discreta sobre data de finalização. Manual anterior não é confirmado automaticamente depois da virada. | Pendente |
| Atualização da PWA | Preencher formulário; disponibilizar a versão candidata; deixar atualizar, fechar todas as janelas e reabrir. | Não ativar à força sobre formulário aberto. Sessão/fila persistida permanecem; a nova versão deve abrir offline após preparação. Reabertura imediata pode anteceder o encerramento da versão antiga. | Pendente |
| Temas e teclado | 320, 375, 390, 430, 768 px e desktop, claro/escuro; preencher login, recuperação e exclusão. | Sem rolagem horizontal, ações acessíveis por rolagem e sem perda de campo ao abrir teclado. A emulação de largura não substitui teclado físico. | Pendente |

## Evidência de autenticação e exclusão

Em homologação, validar cadastro, link real de confirmação, login por nick/e-mail, Google e retorno OAuth, recuperação por e-mail, link expirado, logout e troca de usuário. Verificar SMTP, URLs de retorno autorizadas e limites atuais do Supabase. Os testes deste repositório usam Auth simulado; nenhum e-mail real foi enviado nesta revisão.

Para exclusão, usar **somente contas sintéticas descartáveis em homologação**, após autorização para instalar 044/045 e publicar `delete-account`. Conferir confirmação explícita, ausência de sucesso em falha, impossibilidade de escolher outra conta, limpeza de dados privados e manutenção de resultados anônimos de outros participantes. Nenhuma conta real deve ser excluída para validar a entrega.

Arquivar evidências sem dados pessoais. Uma falha de entrega deve ser investigada distinguindo elegibilidade, assinatura/permissão, despacho e política do sistema operacional; um envio aceito pelo serviço push não comprova exibição na tela.
