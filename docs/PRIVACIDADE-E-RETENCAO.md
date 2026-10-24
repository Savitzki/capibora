# Exclusão, privacidade e retenção técnica

Revisão de 24/10/2026. Implementação **preparada e testada localmente**, dependente da migração 045, da Edge Function `delete-account` e da publicação do frontend. Não houve exclusão de conta real nem alteração de política de retenção em produção.

## Exclusão da própria conta

A interface exige abrir a opção, ler as consequências e digitar `EXCLUIR`. A requisição autenticada exige a confirmação completa e não aceita um ID de usuário escolhido pelo cliente. A função valida a sessão no Auth; somente a identidade verificada pode ser alvo da chamada administrativa. A chave administrativa permanece na Edge Function, sem frontend ou logs de credenciais.

A função recusa a operação enquanto `account_deletion_ready()` não confirmar a migração de privacidade. O hard delete do Auth aciona os relacionamentos e o trigger do banco. Uma falha nos triggers faz a exclusão transacional falhar, preservando Auth e dados; esse rollback foi reproduzido no PostgreSQL descartável. A chamada HTTP administrativa foi validada com respostas simuladas, não com o serviço real de produção.

O cliente aguarda `{deleted:true}` antes de limpar a sessão/cache. O token e a conta são capturados antes da chamada: trocar de usuário durante a espera não muda o alvo nem remove a sessão da conta nova. Falha ou resposta inconclusiva não é apresentada como sucesso. A conclusão da chamada pode ser incerta em uma queda de conexão; verificar o resultado no servidor antes de afirmar sucesso.

## Dados e destino

| Dados | Destino técnico preparado | Justificativa / limite |
| --- | --- | --- |
| Auth, perfil, nome, avatar/foto, metadados e preferências | Hard delete da identidade e cascatas de dados próprios. | Excluir o vínculo e os dados pessoais ativos. Não há upload de foto para bucket no fluxo atual; o perfil armazena a foto reduzida. |
| Treinos, pesos, planos, sessões, snapshots pessoais | Cascata das chaves da conta. | Nenhuma preservação do histórico pessoal após exclusão. |
| Carteira, transações próprias, compras, inventário, missões e conquistas próprias | Cascata da conta. | Não transferir nem alterar o saldo/inventário de sobreviventes. Não foi definida obrigação legal que exija retenção destas linhas nesta implementação. |
| Amizades, convites, provocações, preferências sociais, assinaturas push e consentimentos próprios | Cascatas existentes e limpeza dos recibos que contêm a identidade. | Impedir novos contatos/entregas vinculados à conta excluída. |
| Grupos sem outros participantes nem histórico de sobreviventes | Exclusão do grupo. | Não há resultado compartilhado de terceiros a preservar. |
| Grupos compartilhados dos quais a conta participa | Arquivamento segundo a política existente; dono excluído passa a nulo; nome do grupo do dono removido torna-se `Grupo encerrado`. | Não apagar o histórico coletivo de outras pessoas. Não cria expulsão automática nem transfere propriedade silenciosamente. |
| Resultados coletivos consolidados e metas fechadas | Preservar contagens/datas e resultados numéricos. Remover ID, nome de usuário, avatar, moldura, fuso e dias planejados do participante excluído nos snapshots. Exibir `Conta excluída`. | Integridade dos resultados já recebidos por outros participantes; não manter perfil pessoal identificável por conveniência. Datas e números coletivos podem permitir inferências por pessoas que já conheciam o grupo; não são uma promessa de anonimização irreversível. |
| Desafios concluídos | Preservar placar numérico com participante removido desidentificado e nome próprio do desafio encerrado. | Não reescrever vitória/derrota/empate de sobreviventes nem criar recompensas. |
| Desafios ainda abertos | Usar liquidação oficial se o prazo terminou; nos demais casos, retirar a conta e aplicar a regra existente de participantes insuficientes quando cabível. | Cancelamento não vira derrota automaticamente; sem novo critério competitivo. |
| Cache privado e filas neste aparelho | Limpar após confirmação; avisar explicitamente sobre descarte na interface. Dados de outra conta não são atingidos. | Sessões offline em outros aparelhos só podem ser limpas pelo próprio navegador quando o app voltar a executar e detectar o encerramento. Não existe apagamento remoto garantido de armazenamento de aparelho desconectado. |
| Cache estático, tema e arquivo legado do visitante | Preservados. | Arquivos públicos do app e preferência de aparelho; o legado visitante não é cache privado da conta e nunca vira treino confirmado automaticamente. |

## Temporários e decisões de retenção

| Categoria | Situação verificada | Ação segura / decisão pendente |
| --- | --- | --- |
| Cache estático de versão antiga | O Service Worker existente remove caches anteriores do mesmo escopo ao ativar. | Preservar o mecanismo; não remover caches de outros apps. |
| Cache privado no logout/troca direta de conta | Limpo com invalidação das respostas atrasadas. Logout com pesos pendentes continua bloqueado; rascunhos manuais exigem confirmação de descarte. Encerramento externo da sessão avisa se houve pendências. | Não apagar fila ativa silenciosamente para liberar atualização. |
| Recibo local de recusa definitiva | Uma recusa por conta, sem credenciais; removida quando o servidor confirma a data ou ao limpar a conta. | Impedir retentativa automática permanente de operação já rejeitada. |
| Sessões de treino encerradas/expiradas | Estado operacional protegido por RPC e prazo atual de quatro horas. | Não reabrir sessão encerrada. Prazo de exclusão física do histórico operacional depende de política. |
| Jobs/recibos de notificações e provocações | Estados e recibos existentes impedem reenvio/reapresentação. | Não apagar recibos ainda necessários à deduplicação; definir prazo por estado e horizonte de reenvio antes de criar limpeza automática. |
| Logs de segurança e limites de tentativa | A proteção existente permanece; a exclusão remove a chave de tentativa por hash do nick quando aplicável. | Definir prazo para logs restantes e hashes sem vínculo direto. Não registrar senha, token, endpoint push ou mensagem administrativa bruta. |
| Logs gerenciados, backups, auditoria Auth e réplicas do provedor | Fora das tabelas controladas pelo aplicativo; não foram inspecionados nem apagados nesta revisão. | O responsável deve verificar política/configuração do Supabase e definir prazos e eventuais obrigações legais. Não inventar prazo nem prometer eliminação imediata de backups. |
| Resultados compartilhados sem vínculo pessoal ativo | Preservados pela necessidade técnica de não alterar o histórico de terceiros. | Definir prazo de retenção coletiva se o produto precisar de expiração futura. Nenhum Cron destrutivo foi criado. |

Não foi criada uma obrigação legal presumida para reter dados pessoais. Qualquer retenção adicional precisa de finalidade, base aplicável, acesso restrito e prazo definidos pelo responsável. A implantação deve incluir a conferência dos serviços gerenciados citados acima.

## Validação e implantação

`supabase/tests/account-deletion.sql` usa apenas usuários sintéticos no PostgreSQL descartável: cascatas, falha forçada e rollback, impossibilidade de excluir terceiros como cliente, dados compartilhados preservados, resultados desidentificados e carteira alheia intacta. `delete-account/core.test.ts` e `service.test.ts` usam dependências/fetch simulados para confirmação, autorização, readiness, falhas e repetição concorrente. A interface cobre cancelamento, dupla submissão e preservação em erro.

A implantação das migrações e da função administrativa permanece **pendente de autorização explícita**. Depois dela, executar o roteiro de homologação com contas sintéticas antes do piloto. Não usar a exclusão de uma conta real como teste de fumaça.
