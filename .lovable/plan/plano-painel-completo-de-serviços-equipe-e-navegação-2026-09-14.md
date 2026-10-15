# Plano: painel completo de serviços, equipe e navegação

## Resultado esperado
Organizar o painel do dono com a navegação lateral da referência, usando os mesmos ícones lineares, cor azul e pequenos títulos de seção. Manter os módulos já aprovados sem alterar seu funcionamento e transformar Serviços e Profissionais em cadastros completos, conectados ao agendamento do cliente.

## Barra lateral e conta
- Reorganizar os itens, sem remover páginas:
  - **Agenda:** Agenda, Horários Bloqueados, Funcionamento
  - **Gestão:** Clientes, Profissionais, Serviço, Produtos
  - **Financeiro:** AS Pay, Caixa, Pagamentos, Relatório
  - **Comunicação:** Templates, WhatsApp
  - **Sistema:** Configurações, Integrações, Assinatura
- Reproduzir o estilo dos ícones da referência: traço fino, tamanho uniforme, azul no item ativo, marcador vertical e textos secundários discretos.
- Manter a logotipo Agenda Agora e o seletor de estabelecimento.
- Criar o resumo da conta com nome, situação da assinatura, mensalidade, mês pago e dias restantes; o acesso completo fica na página Assinatura.
- Preservar o menu móvel, saída e as animações rápidas de clique.

## Serviços
- Substituir o cadastro simples por uma janela com abas **Dados**, **Vínculos** e **Imagem**, no visual atual do Agenda Agora.
- **Dados:** nome, valor, duração, sinal, descrição, opção de combo e controles para mostrar valor, duração e serviço ao cliente.
- **Vínculos:** escolher quais profissionais podem executar o serviço.
- **Imagem:** enviar, trocar e remover uma foto; ela será exibida somente nos detalhes após o cliente selecionar o serviço.
- Permitir criar, editar, ativar/desativar e excluir.
- Fazer as escolhas de visibilidade refletirem na página pública; serviços ocultos não aparecem.

## Profissionais
- Substituir o cadastro simples por uma janela com abas **Dados**, **Vínculos** e **Permissões**.
- **Dados:** foto, nome, cargo, telefone, e-mail, senha de quatro dígitos e controle para mostrar/ocultar a senha durante o cadastro.
- **Vínculos:** dias de atendimento e serviços prestados, com opção “Todos”.
- **Permissões:** administrador, cancelar agendamento, concluir atendimento, reabrir atendimento, ver telefone de clientes, criar agendamento, bloquear agenda, vender/ver produtos, receber notificações e gerar QR Code.
- Permitir criar, editar, ativar/desativar e excluir profissionais.
- Criar acesso individual por telefone ou e-mail e senha; cada profissional verá somente o estabelecimento ao qual pertence.
- Aplicar as permissões tanto nos botões e páginas quanto nas regras de acesso aos dados, evitando que uma ação bloqueada seja feita por acesso direto.

## Agendamento do cliente
- Após escolher o serviço, mostrar a imagem apenas nos detalhes.
- Adicionar a escolha de profissional, filtrada pelos vínculos do serviço e pelos dias em que cada profissional atende.
- Calcular horários disponíveis para o profissional escolhido e salvar esse vínculo no agendamento.
- Respeitar os controles “mostrar valor”, “mostrar duração” e “mostrar serviço”.

## Dados e segurança
- Ampliar Serviços e Profissionais com os novos campos.
- Criar vínculos serviço–profissional e dias de atendimento.
- Criar funções e regras de acesso para profissionais e permissões, mantendo o dono com acesso total e o painel master isolado.
- Reutilizar o armazenamento protegido já existente para as fotos, com links temporários seguros.
- Criar o acesso do profissional no servidor; nenhuma senha será salva nas tabelas do painel.
- Atualizar os tipos do aplicativo após a migração.

## Validação
- Testar criação e edição de serviço, seus vínculos, visibilidade e imagem.
- Testar criação do profissional, login próprio e bloqueios/liberações de cada permissão.
- Testar seleção do serviço, detalhes, profissional, data e horário no fluxo do cliente.
- Conferir barra lateral em computador e celular, além da conta e assinatura.
- Confirmar que Agenda, AS Pay, Relatório, Caixa, Clientes, Templates, Pagamentos, Horários Bloqueados, Funcionamento, Configurações, Integrações e Assinatura continuam funcionando como antes.
