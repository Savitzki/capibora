# Capibora

Treinos, amigos e pequenas vitórias. Capibora ajuda a manter uma rotina de movimento com planejamento semanal, descansos, desafios e recompensas. Interface mobile flat, em carvão, marrom e laranja quente, construída com React, TypeScript e Vite.

A [identidade Capibora](docs/CAPIBORA.md) preserva contas, dados e funcionalidades existentes. Os [logos oficiais](public/brand/README.md) e as [seis expressões da mascote](public/mascot/README.md) estão integrados, com os arquivos originais preservados e cópias leves para a web.

A [revisão de simplificação](docs/SIMPLIFICACAO.md) registra a organização das funções, os controles removidos e os detalhes disponíveis sob demanda.

A [revisão final de regras, segurança e experiência de 24/10/2026](docs/REVISAO-FINAL-2026-10-24.md) reúne evidências, correções e testes das 24 verificações. As migrações **044/045**, a função **delete-account**, a atualização de **push-dispatch** e este frontend estão **preparados, sem implantação nesta revisão**. Veja também o [roteiro físico de celulares](docs/ROTEIRO-PILOTO-CELULARES.md) e a [política técnica de exclusão e retenção](docs/PRIVACIDADE-E-RETENCAO.md).

## Executar

Requer Node.js **22.12 ou superior** e npm. Ambiente validado com Node 24.

```sh
cd /workspace/FokusTrainer
npm ci
npm run dev -- --port 5173 --strictPort
```

Para outro computador, use o diretório em que você clonou o projeto. O servidor de desenvolvimento usa a porta 5173. Não há banco ou variável obrigatória para explorar a apresentação visitante. Treinos, peso e ofensiva exigem login; configure o Supabase para esse fluxo. Sem conta, somente Início e Treinos ficam disponíveis, com uma demonstração semanal sem gravação de dados. Veja o [modo visitante](docs/MODO-VISITANTE.md).

```sh
npm test       # testes de regras de negócio e fluxos da interface
npm run check:types # tipos e declarações sem uso
npm run build # verificação TypeScript e compilação de produção em dist/
npm run preview -- --port 4173 --strictPort # validar a compilação localmente
```

## Cadastro e banco de dados

[Nicks e amizades](docs/NICKS-E-AMIZADES.md): @nick único e imutável após salvar, sugestões para nomes ocupados, login por nick/senha e busca de amigos com aceite. Nome das frases e avatar seguem editáveis no perfil único, junto do e-mail e do botão de sair. Exige as migrações 014/015 e a Edge Function `login-with-nickname`, já aplicadas e ativas em produção desde 17/10/2026 (veja [registro histórico de produção](#registro-histórico-de-produção)).

“Entrar” abre diretamente o login por e-mail ou nome de usuário. Não há consulta pública de existência de e-mail: a migração 041 removeu esse acesso e o cadastro mantém uma resposta neutra. A recuperação preparada nesta revisão usa o Supabase Auth, preservando seus limites de tentativas e sem revelar se o endereço existe.

Veja o [guia de configuração do Supabase](docs/BANCO-DE-DADOS.md) para criar o banco e habilitar o cadastro. O [guia de amigos, grupos e push](docs/PUSH-E-GRUPOS.md) explica as migrações adicionais, as chaves e o agendador. Com o serviço configurado e a migração 004 aplicada, perfil, novos treinos e pesos podem sincronizar; os lembretes locais ficam no dispositivo, separados por conta. Sem configuração externa, o perfil é local e não cria login.

O cadastro por e-mail pergunta **E-mail → Senha**, com opção de voltar preservando o preenchimento. A conta só é criada no envio final. Depois da confirmação e do login, a conclusão do perfil exige nome de usuário, nome e escolha de sexo/tratamento, aceitando **Prefiro não informar**. O modal acompanha a área visível do teclado com `VisualViewport` e `interactive-widget=resizes-content`. Após o envio, há uma tela de confirmação por e-mail com acesso ao login e reenvio do link. Erros do acesso com Google aparecem junto do botão.

Na conclusão do perfil, o nome e a escolha de **Sexo** são obrigatórios; **Masculino**, **Feminino** e **Prefiro não informar** são válidos. Essa escolha adapta a linguagem das frases; os valores existentes em `user_metadata.display_name` e `phrase_treatment` são preservados, sem nova tabela. Algumas frases usam o primeiro nome (ou o início do nick); nomes longos usam a frase geral para manter uma linha. Nome de apresentação e preferências continuam editáveis no perfil.

A preferência por estado e a personalização regional foram removidas do cadastro, do perfil e das frases. A migração [007](supabase/migrations/202610170007_remove_state_preference.sql) remove apenas essa preferência antiga dos metadados do Supabase Auth, preservando nome, sexo e demais informações da conta.

Ao enviar o cadastro, a apresentação de confirmação é neutra, inclusive quando o Supabase indica uma conta existente; não revela o cadastro de terceiros.

E-mail e senha são validados em sua própria etapa. Recusas do Supabase identificam o motivo e, quando necessário, voltam ao campo correspondente, preservando as outras informações. Limites de envio e falhas do serviço não são apresentados como erro de preenchimento. O cadastro público depende de SMTP próprio para as confirmações; veja [configuração e diagnóstico de e-mail](docs/BANCO-DE-DADOS.md#se-novos-cadastros-falharem).

O cadastro também oferece **Continuar com Google**, usando a mesma conta Google/Gmail para criar ou acessar o perfil. É necessário configurar o cliente OAuth no Google Cloud e habilitar o provedor no Supabase; veja [o passo a passo](docs/LOGIN-GOOGLE.md).

A compilação de produção já usa a URL e a chave Publishable públicas do projeto `qfzoeshhogoilsmvxlif`, em `.env.production`. O workflow lê esse arquivo quando as variáveis do GitHub estão vazias. As migrações precisam estar aplicadas no banco; configuração salva não significa conexão online validada. Para usar esse projeto também em desenvolvimento, copie `.env.production` para `.env.local`.

### Registro histórico de produção

Registro de 18/10/2026, com anotações posteriores, no projeto `qfzoeshhogoilsmvxlif`. Esta lista não representa uma inspeção atual do ambiente; a revisão de 24/10 foi executada em banco descartável e não implantou alterações:

- **Migrações:** estrutura 001–023 instalada. O histórico oficial do Supabase registra 012 e 014–023; as demais versões foram aplicadas manualmente e não constam nele. Confira a estrutura real antes de usar `supabase db push` e não reaplique migrações antigas para preencher o histórico (detalhes em [BANCO-DE-DADOS.md](docs/BANCO-DE-DADOS.md)).
- **Edge Functions:** `login-with-nickname` está ativa (versão 6, auditoria de 23/10/2026). `push-dispatch` e `group-notify` estão publicadas, e o Cron de push está ativo a cada 15 minutos (auditoria de 23/10/2026). A ativação está em [PUSH-E-GRUPOS.md](docs/PUSH-E-GRUPOS.md).
- **Frontend:** publicado pelo GitHub Pages a cada atualização de **main**, após os testes.

## Plano Semanal bloqueado

Cada conta nova precisa configurar seu plano antes do primeiro registro manual ou cronometrado. A reformulação de Treinos permite **1 a 7 dias**, com seleção de quantidade, dias e confirmação explícita antes de salvar. O primeiro plano vale hoje; substituições valem amanhã e preservam as versões anteriores. A tela reúne plano visível, calendário da ofensiva baseado em snapshots e histórico aberto com 20 registros por vez. Sessões ativas podem ser retomadas das demais abas. **A migração 029 foi autorizada e aplicada em produção em 19/10/2026**, com verificação da preservação dos dados das 39 tabelas e das permissões. Veja [regras, compatibilidade, testes e ativação](docs/SEMANA-E-DESCANSOS.md).

## Registro manual e cronometrado (migração 023 ativa)

O novo registro oferece **Iniciar treino** (cronômetro com mínimo de 35 minutos e expiração em 4 horas) e **Registrar manualmente** (mínimo declarado de 35 minutos e um interrogatório curto com três confirmações Sim/Não). A sessão é persistida no servidor e pode ser recuperada após fechar a PWA ou em outro dispositivo. Os dois métodos preservam uma confirmação e uma recompensa por dia, cronograma, descansos, reagendamentos e Arena. Avaliação após o cronômetro é opcional; registros anteriores mantêm sua classificação de compatibilidade.

A **migração incremental 023 foi autorizada e aplicada em produção em 18/10/2026**, com preservação dos registros, saldos e snapshots anteriores. A migração **024**, autorizada e aplicada em produção em **18/10/2026**, troca somente a avaliação manual por duas perguntas variadas e uma confirmação fixa de veracidade/duração. Exige três respostas positivas; uma negativa não salva nem recompensa. A transação preservou os dados existentes e as funções do cronômetro; o frontend atualizado exige essa versão do banco. O cronômetro mede a duração da sessão, sem comprovar fisicamente o exercício; 35 minutos é uma regra do produto. Veja [métodos, segurança, testes e ativação](docs/REGISTRO-DE-TREINOS.md).

## O que está incluído

**Expansão de gamificação:** [cinco etapas, regras, testes e ativação](docs/GAMIFICACAO.md). As migrações 017–021 acrescentam missões semanais, medalhas, relatórios privados, desafios com aceite e cosméticos na Loja. Foram autorizadas e **aplicadas em produção em 17/10/2026**, com preservação dos registros anteriores. A interface correspondente integra esta publicação; mantém os sistemas atuais e o foco em hábitos e consistência.

- [Modo visitante](docs/MODO-VISITANTE.md) com somente Início e Treinos. A Home apresenta a mascote, três benefícios e entrada na conta; Treinos mostra uma demonstração semanal estática. Entrar, Começar agora e Criar meu plano abrem o mesmo formulário existente de login/cadastro. A navegação completa retorna após entrar. Registros locais antigos ficam preservados e ocultos; não são convertidos automaticamente em treinos confirmados.
- Confirmação única do treino de hoje, com atividade e duração. A chama acende ao confirmar, e o registro fica permanente no app: sem edição ou exclusão e sem novos treinos na mesma data. Não é possível preencher dias passados ou futuros.
- No **Início**, os atalhos **Descansar hoje** e **Usar kit** ficam abaixo de Registrar treino, apenas quando há um treino pendente que pode ser protegido. O uso do kit exige confirmação com as regras e o consumo do item; sem kits, o atalho abre a carteira.
- [Potes de proteína e Kit Médico](docs/MOEDAS-E-KITS.md): carteira por conta, treino +10 e primeiro peso válido do dia +2. Oferece 2 kits gratuitos por mês, sem acumular, e compra por 350 CapiWhey, sem cota semanal de uso. O [fechamento automático do dia](docs/KITS-AUTOMATICOS.md), após a migração 031, usa estoque disponível para proteger faltas e mostra um aviso na próxima abertura. Saldo e compras anteriores preservados. A migração 016 foi autorizada e aplicada em 17/10/2026.
- [Semana personalizada e descansos](docs/SEMANA-E-DESCANSOS.md): **Treinos → Meu plano semanal**, de 1 a 7 dias após a migração 029. Descansos válidos mantêm a ofensiva sem somar; faltas sem proteção interrompem. Até 2 reagendamentos e 2 extras semanais, independentes dos kits. Metas emitidas e desafios aceitos são preservados; primeiro plano hoje, substituições amanhã.
- No **Início**, o card da Capibora é seguido de **Sua semana** (segunda a domingo) e **Metas da semana**. O cabeçalho reúne ofensiva, saldo **CapiWhey** e perfil; os indicadores extras saíram da Home. A proteção pode ser sugerida após 23h no fuso da conta, com consulta atualizada e confirmação antes de usar kit ou descanso. Veja [interface e regras da sugestão](docs/INICIO-INTERFACE.md).
- Barra fixa na borda inferior, só com ícones, na ordem Início, Treinos, Arena, Peso, Loja e Configurações, com espaçamento adaptado a telas pequenas e balança de banheiro no Peso. Nomes acessíveis, endereços compartilháveis e suporte ao botão Voltar preservados. A Loja reúne saldo, kits e cosméticos; o saldo no topo também abre essa página. O histórico de movimentações permanece oculto conforme a decisão existente.
- Calendário mensal de segunda a domingo, consulta a meses anteriores, detalhes por dia e lista completa dos treinos do mês, com horário quando disponível.
- Perfil com avatar e nick em destaque, trajetória (treinos, ofensiva e recorde), dados da conta e três espaços para medalhas. **Editar perfil** reúne nome, sexo, avatar e foto; **Cancelar** descarta a edição local. O nick salvo continua imutável. Medalhas ficam em uma prévia compacta com **Gerenciar medalhas**; a privacidade dos destaques depende de consentimento. A loja e o botão de sair permanecem acessíveis. As fotos são recortadas ao centro e reduzidas no dispositivo; selecione JPG, PNG ou WebP de até 5 MB.
- Card de ofensiva em PNG, Story 1080 × 1920 ou quadrado 1080 × 1080, com nick/avatar e mensagem editável de até 160 caracteres. Permite baixar, copiar a mensagem e abrir o compartilhamento nativo de arquivos, se suportado. Não publica automaticamente nem inclui os registros de peso. Com a sequência zerada, a opção de compartilhar fica bloqueada.
- [Peso sincronizado entre aparelhos](docs/PESO-E-HORARIOS.md), privado por conta, com várias pesagens imutáveis por dia, horários individuais, recuperação de registros locais, importação opcional do histórico sem conta e fila offline. Exige a migração 011.
- Corrida diária dentro do grupo: posições e horários pela primeira confirmação online de cada participante com treino obrigatório. Empates compartilham a posição; membros em descanso válido ficam protegidos, sem colocação por treinos voluntários.
- Fogo centralizado e celebração breve somente após registrar um treino novo; animação desativada quando o aparelho pede movimento reduzido.
- Peso em kg, aceitando vírgula ou ponto e uma casa decimal. Várias pesagens imutáveis podem existir na mesma data, cada uma com seu identificador; reenvios não duplicam registros nem a recompensa diária. Histórico e gráfico preservam os registros individuais.
- Dois lembretes diários independentes, com horário configurável: treino e peso. São desativados por padrão. Ações já registradas no dia não geram lembrete. Um lembrete vencido é exibido na próxima verificação, no máximo uma vez por dia.
- Alertas dentro do app e notificações do navegador, quando autorizadas.
- Aba **Arena** com busca por @nick e pedidos aceitos pelo destinatário e grupos com limite vigente de cinco participantes para novas entradas; grupos legados maiores são preservados. Quem tem treino obrigatório precisa confirmar online no dia do grupo; descansos válidos protegem os demais. Se todos descansarem, a sequência se mantém sem somar. Uma falta sem proteção interrompe a sequência; o recorde permanece. Exige as migrações sociais e a migração 008 no Supabase. A interface está organizada em Grupos, Amigos e Desafios, com resumos compactos e detalhes sob demanda; consulte [Arena](docs/ARENA-INTERFACE.md).
- Grupos e amigos em abas próprias, cartões para selecionar o time, busca de amigos, compartilhamento do código e progresso visual das chamas. Formulários e instruções aparecem conforme a ação escolhida.
- [Aviso opcional ao grupo após o treino](docs/AVISOS-DO-GRUPO.md): escolha os grupos e confirme o envio, ou use **Agora não**. Recuperar histórico não abre a tela nem envia alertas. Exige a migração 005, funções de envio e push autorizado nos aparelhos dos destinatários.
- Web Push opcional com o app fechado, tom leve ou dramático e chamadas às 6h, 8h e 10h, além do horário salvo e das 21h, enquanto houver treino pendente (atualização 043). Exige a Edge Function, chaves VAPID, cron no Supabase e autorização do celular. Instalar a PWA ou publicar no Pages não ativa esse serviço sozinho.

## Notificações e horário

O servidor confirma treinos e consolida a ofensiva pelo **fuso fixado na conta**. O relógio do aparelho não autoriza datas retroativas. Lembretes locais usam o mecanismo do app aberto, com verificações a cada 15 segundos e ao retornar à aba; o navegador pode atrasá-los. Alterar um horário após o aviso não dispara outro lembrete local daquela data.

Notificações do sistema dependem de permissão, suporte do navegador e um contexto seguro (**HTTPS** em produção; loopback é aceito no desenvolvimento). Um service worker exibe os avisos em navegadores compatíveis. Permissão bloqueada pode ser alterada nas configurações do navegador. Os alertas internos continuam funcionando sem essa permissão.

**Lembretes locais precisam do app aberto.** Para avisos com o app fechado, siga [a ativação do Web Push](docs/PUSH-E-GRUPOS.md). O servidor agenda pelo fuso salvo em cada aparelho, suprime avisos após o treino sincronizar e desativa assinaturas expiradas. O drama é opcional. Em iOS 16.4+, é necessário instalar na Tela de Início e abrir pelo ícone. A entrega depende da rede, do navegador e do sistema, sem garantia de horário exato.

## Instalar no celular (PWA)

Depois de publicar no GitHub Pages, abra o endereço **HTTPS** do app no celular:

- **Android / Chrome:** abra a página **Configurações** e toque em **Instalar app**, abaixo dos lembretes, e confirme a instalação. Se o navegador ainda não oferecer a janela automática, use o menu **⋮ → Instalar app** ou **Adicionar à tela inicial**. Navegação anônima e navegadores internos de outros apps podem impedir a instalação.
- **iPhone / Safari:** toque em **Compartilhar → Adicionar à Tela de Início → Adicionar**. Se aparecer a opção **Abrir como App**, ative-a. O botão no app também mostra essas instruções.

O app instalado abre em janela própria (`standalone`), mantendo a navegação do sistema. As barras do sistema usam a cor do tema onde há suporte; o fundo da página também preenche as áreas de segurança do celular. O tema salvo é aplicado antes do primeiro desenho da página para reduzir flashes claros ao abrir no modo escuro. Após o primeiro acesso online e a preparação do cache, a interface e a consulta aos registros já sincronizados funcionam offline. No novo fluxo 023, iniciar/finalizar/cancelar sessões e confirmar definitivamente registros manuais exigem conexão; o preenchimento manual e os pesos mantêm filas offline por conta, sem antecipar recompensas de treino. O cache guarda somente os arquivos do aplicativo. Perfil, novos treinos e pesos podem sincronizar com a conta quando há internet; grupos exigem confirmação recebida no servidor dentro do dia. Não há garantia de que o Safari compartilhará os registros da aba com a versão instalada; prefira continuar usando a mesma versão.

O tema escolhido atualiza `theme-color`, `color-scheme`, o fundo de `html`/`body` e a configuração de instalação da PWA: `manifest.webmanifest` mantém as barras escuras (`theme_color: #121212`), e `manifest-light.webmanifest` usa as claras (`theme_color: #faf8f5`). O `background_color` acompanha o mesmo tema, evitando que o pacote Android reutilize laranja como fundo da janela ou das barras. O carregamento usa esse mesmo fundo, com a capivara pulsando já no HTML antes do JavaScript; `html`, `body` e `#root` mantêm o tema durante toda a abertura. Após os dados estarem disponíveis e o mínimo existente de dois segundos, a camada da capivara esmaece por 240 ms sobre a interface pronta, sem tela intermediária. Com movimento reduzido, não há pulsação nem esmaecer. O endereço anterior `manifest-dark.webmanifest` permanece disponível para instalações existentes. Todos mantêm o mesmo ID, escopo e endereço inicial do app. Sem preferência salva, o padrão e os fallbacks são escuros; a escolha explícita de modo claro é preservada. O tema salvo seleciona a configuração antes do React carregar, e todos os manifestos ficam no cache offline. A navegação inferior aplica `safe-area-inset-bottom`, mantendo o fundo do tema até a borda da tela. A cor das barras de ações e gestos segue esses valores onde o navegador e o sistema permitem. O app não solicita tela cheia nem oferece um controle para ocultá-las. Uma instalação existente pode manter a cor anterior até o navegador atualizar a PWA e ela ser reaberta. A troca de cor da barra nativa não é garantida em tempo real; depende do Android, do navegador e do tipo de navegação (gestos ou três botões). Não apague os dados nem desinstale o app para tentar acelerar essa atualização.

Os manifestos são atualizados pela rede quando há conexão, mantendo a última versão válida offline. Veja [como conferir e atualizar a instalação Android sem apagar dados](docs/TEMA-ANDROID-PWA.md) se a barra estiver correta na aba do Chrome e diferente no PWA instalado.

A compilação gera o cache do service worker com a lista exata de arquivos e uma versão baseada no conteúdo. Para carregar uma atualização publicada, conecte-se à internet, abra o app e depois feche todas as abas/janelas do Capibora e abra novamente. O novo cache só ativa após as janelas antigas fecharem; caches de outros apps da mesma origem não são removidos. Em desenvolvimento (`npm run dev`), o cache offline fica desativado. Teste a instalação e o offline com a compilação de produção servida por HTTPS ou loopback.

## Armazenamento

Sem login, o perfil e eventuais registros antigos ficam no `localStorage` desta origem, na chave `fokus-trainer:v1`. Com login, os registros locais de cada conta ficam em `fokus-trainer:v1:account:<id>`, separados dos registros sem login. Ao sair, o app remove os dados locais da conta atual e a fila de pesos já concluída. O arquivo legado do visitante permanece preservado para recuperação, sem ser mostrado na apresentação ou importado automaticamente como treino confirmado. O tema e o cache de arquivos do app são mantidos. Pesos pendentes ou em conflito precisam ser sincronizados/resolvidos antes da saída para não serem perdidos. Perfil e pesos continuam sincronizando com o Supabase atualizado. No novo fluxo de treinos (023), a confirmação definitiva é online; sessões ativas são recuperadas do servidor e não dependem do cache local. Treinos de dias passados não são importados para o servidor. Pesos anteriores associados à conta são enviados ao atualizar; pesos sem login têm importação opcional. Pesagens offline ficam em uma fila por conta, com identificador por registro e reenvio sem duplicar. Valores salvos não podem ser alterados; conflitos de identificador nunca sobrescrevem o registro confirmado. Limpar os dados do navegador apaga os registros locais. Mudar a origem abre outro armazenamento. Dados antigos sem o campo de perfil são carregados sem perder treinos ou pesos.

O aviso para completar nick e avatar só aparece após uma consulta bem-sucedida confirmar a ausência do perfil. Durante carregamento ou falha de consulta, o app aguarda ou oferece nova tentativa.

Dados malformados não são sobrescritos automaticamente: o app informa o erro e preserva o conteúdo para recuperação. Se o armazenamento estiver indisponível ou cheio, ele avisa que os dados não puderam ser salvos. Não use esta versão como único arquivo de longo prazo dos seus registros; exportação e backup são melhorias futuras.

## Estrutura

A sincronização seletiva, o cache por conta, os estados de carregamento e a
recuperação após falhas estão descritos em [SINCRONIZACAO.md](docs/SINCRONIZACAO.md).
Gravações confirmadas atualizam os recursos relacionados sem recarregar a página;
não é necessária uma nova migração no Supabase.

A interface mantém a sincronização normal silenciosa e mostra apenas um ponto
de atividade durante atualizações em segundo plano. Pendências, erros e
confirmações de consumo continuam visíveis. O extrato tem contrato no backend,
mas permanece oculto na Loja por decisão anterior, coberta por teste de regressão.
Sua exposição depende de decisão de produto. Detalhes dos relatórios e
explicações secundárias ficam recolhidos; switches não geram avisos de confirmação.

- `src/App.tsx`: painel, formulários, diálogos e agendamento enquanto o app está aberto.
- `src/model.ts`: tipos, validação, datas, ofensivas e regras dos lembretes.
- `src/profile.ts` e `src/ProfilePanel.tsx`: nick, avatar, foto e telas da conta.
- `src/account.ts` e `supabase/migrations/`: integração com Supabase Auth e tabela de perfis.
- `src/social.ts` e `src/SocialPanel.tsx`: confirmação online, amigos e grupos.
- `src/push.ts`, `src/useNotificationOnboarding.ts`, `src/NotificationOptIn.tsx` e `supabase/functions/push-dispatch/`: inscrição por aparelho e envio agendado de Web Push.
- `src/SharePanel.tsx` e `src/sharing.ts`: geração e compartilhamento do card.
- `src/notifications.ts`: integração com notificações do navegador.
- `src/InstallApp.tsx`, `public/manifest.webmanifest` e `public/icons/`: instalação e ícones da PWA.
- `public/sw.js` e `scripts/build-sw.mjs`: cache offline e atualizações do aplicativo.
- `src/styles.css`: layout responsivo com prioridade para celular, navegação inferior, botões grandes e formulários como painéis inferiores no mobile.
- `src/*.test.*`: testes de ofensivas, confirmação diária, lembretes, peso, instalação e persistência.

Para publicar a aplicação, sirva o conteúdo de `dist/` em HTTPS, mantendo `sw.js` junto de `index.html` no diretório do app. O servidor Vite é destinado ao desenvolvimento.

## Hospedar no GitHub Pages

O projeto inclui `.github/workflows/pages.yml` para compilar, testar e publicar o app. Cada atualização de **main** dispara a publicação, após os testes passarem. Também é possível publicar manualmente.

1. Abra o repositório `Savitzki/capibora` no GitHub.
2. Entre em **Settings → Pages**. Em **Build and deployment → Source**, selecione **GitHub Actions**. Se Pages não estiver disponível, confira suas permissões e o plano do repositório; o GitHub Free oferece Pages para repositórios públicos. Não é necessário mudar a visibilidade de um repositório privado sem avaliar essa decisão.
3. Envie as alterações para **main**, ou vá a **Actions → Publicar no GitHub Pages → Run workflow**, selecione **main** e confirme. Se Actions estiver desativado, habilite-o para este repositório.
4. Aguarde os jobs **build** e **deploy** ficarem verdes. O GitHub exibirá o endereço publicado em **Settings → Pages** e no ambiente **github-pages** da execução. O endereço esperado, sem domínio personalizado, é `https://savitzki.github.io/capibora/`; ele só estará disponível após uma publicação bem-sucedida.
5. Novos commits em **main** publicam as atualizações automaticamente.

Para abrir os testes a outras pessoas e corrigir links de confirmação que levam a localhost, siga [PUBLICAR-TESTE.md](docs/PUBLICAR-TESTE.md). A URL pública de retorno é definida em `VITE_APP_URL`; o Supabase também precisa autorizar esse endereço. O cartão da ofensiva destaca 50 provocações diretas sobre atitude/compromisso, mais 12 respostas depois do registro, com personalização pelo nome. As frases ficam em uma linha, são escolhidas a cada visita e renovadas na virada do dia, sem alternar durante o preenchimento.

Configurações fica na ordem **Aparência → Sobre o app → Instalação**, com títulos simples, sem cartões separando as seções ou blocos de status de autorização/push indisponível. O convite de notificações aparece após concluir o perfil, fora dessa tela. O switch **Modo escuro** alterna a aparência imediatamente e salva a escolha neste aparelho, inclusive sem cadastro e offline. O modo inicial é escuro; a preferência é compartilhada entre as contas usadas no mesmo navegador.

Depois de salvar nick e avatar, o app pergunta **Quer receber notificações?**, com a capivara e os botões **SIM** (laranja) e **NÃO** (contorno). Só SIM solicita a permissão nativa e cadastra a assinatura push no Supabase. A escolha fica associada à conta e à instalação; NÃO não solicita permissão nem se repete a cada visita. Contas por e-mail e Google utilizam o mesmo fluxo. Os controles de notificações saíram de Configurações. Após um treino confirmado, **Avisar o time?** continua opcional.

Esse fluxo requer a migração **028** e a configuração existente de Web Push. Aparelhos já inscritos mantêm horários e tom. Novas inscrições usam 18h e tom com deboche, com a chamada das 21h e, na atualização 043, chamadas matinais às 6h, 8h e 10h. Para bloquear notificações, use as permissões do celular ou navegador. No iPhone, abra pela PWA instalada. Veja [o guia de notificações](docs/PUSH-E-GRUPOS.md).

O Vite gera caminhos relativos e as notificações respeitam a subpasta `/capibora/`. O GitHub Pages hospeda apenas o frontend: a sincronização de peso, amigos, grupos e push dependem da configuração separada do Supabase. Publicar o ambiente do Codex é uma operação separada da publicação do site no GitHub Pages.

A [Loja e personalização](docs/LOJA-E-PERSONALIZACAO.md) reúne molduras, cards, temas e emojis com previews reais e confirmação de compra. [Enviar imagens da Loja](https://github.com/Savitzki/capibora/upload/main/public/images/shop). A expansão utiliza a migração incremental 026 e preserva a carteira, o inventário e os seis produtos anteriores.

A [linguagem e as notificações da Capibora](docs/LINGUAGEM-E-NOTIFICACOES.md) usam um catálogo compartilhado, variações por horário e tom, sem cobranças em descanso ou com cronômetro ativo. A migração incremental 027 reforça a validação e a deduplicação dos lembretes existentes; publicar também `push-dispatch` e `group-notify`. A marca clara transparente e o novo ícone oficial ficam em `public/brand/`.

- [Catálogo de 28 conquistas](docs/CONQUISTAS.md): 12 IDs preservados, 16 novos, raridades e medalhas preparadas para artes oficiais. A migração 032 foi aplicada no Supabase após autorização, preservando desbloqueios, datas e economia; não há pagamentos por conquistas.

- [Evolução da Arena](docs/ARENA-EVOLUCAO.md): grupos administrados, metas semanais, desafios versionados e provocações. Migrações 033/034 aplicadas no Supabase em 20/10/2026 após autorização, preservando dados anteriores. Frontend publicado pelo workflow de `main`; push opcional de provocações permanece desativado.

- [Auditoria e otimizações de desempenho](docs/DESEMPENHO.md): cache inicial 95,5% menor, imagens WebP e telas sob demanda. `npm run prepare:images` reproduz as cópias de entrega sem alterar os originais. A migração 035 contém somente índices e foi aplicada em produção em 20/10/2026 após autorização, com preservação de dados, funções, RLS e permissões verificada.

Cadastro, confirmação de e-mail e configuração inicial do treino: [fluxo de entrada e primeiro plano](docs/CADASTRO-E-PRIMEIRO-PLANO.md).

A segurança da autenticação, a política CSP e a implantação da atualização 041 estão documentadas em [SEGURANCA-IMPLANTACAO-041.md](docs/SEGURANCA-IMPLANTACAO-041.md).
