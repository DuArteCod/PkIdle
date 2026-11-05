# PkIdleGrid

Aplicativo desktop em Electron para acompanhar até quatro sessões do **Poke Idle World** em uma única janela. Este projeto é independente e não é afiliado aos desenvolvedores do jogo.

## Requisitos

- Windows 10 ou posterior para usar o inicializador `.bat` incluído.
- Node.js LTS instalado.
- Conexão com a internet para instalar as dependências e carregar o jogo.

## Instalação e execução

1. Instale o Node.js LTS pelo [site oficial](https://nodejs.org/).
2. Extraia ou clone esta pasta.
3. No Windows, execute `Iniciar PkIdleGrid.bat`. Na primeira execução, o script instala as dependências.

Também é possível executar pelo terminal:

```sh
npm ci
npm start
```

Para recompilar o CSS depois de alterar os estilos:

```sh
npm run build:css
```

## Recursos

- Até quatro sessões do jogo, cada uma com cookies e armazenamento isolados.
- Layouts de grade, duas contas lado a lado e foco em uma conta.
- Gerenciamento de credenciais e tentativa de login automático. As credenciais só são salvas quando o armazenamento seguro do sistema está disponível; o Electron usa o mecanismo de proteção da plataforma.
- Painel de farm com dados de sessão, dinheiro e itens recebidos.
- Histórico de capturas com filtros e ordenação.
- Janela de IVs com leitura de Pokémon, análise, golpes, comparação de até três Pokémon fixados e histórico recente.
- Compra remota de Pokébolas para a conta escolhida. A ferramenta não oferece venda remota de itens.
- Leitor de IVs para Pokémon exibidos em áreas compatíveis do jogo, como bag e loja.
- Viagem rápida pela Pokédex, modo de interface limpa e opção para ocultar o chat.

Os recursos que leem informações do jogo dependem das telas e mensagens que o próprio jogo disponibiliza e podem mudar se o jogo for atualizado.

## Estrutura

```text
main.js                 Processo principal do Electron
preload.js              APIs permitidas entre a interface e o Electron
index.html              Interface principal
src/domain/             Catálogo e cálculos
src/game/collector.js   Integração de leitura com as sessões do jogo
src/styles/             CSS fonte e CSS compilado
src/ui/                 Módulos da interface
assets/                 Recursos visuais
```

## Dados e privacidade

As credenciais são armazenadas no diretório de dados do Electron, fora desta pasta do projeto, e não devem ser incluídas em commits. O `.gitignore` exclui dependências, logs, arquivos temporários e arquivos de credenciais. Não compartilhe cópias do diretório de dados do aplicativo.

Antes de usar ou distribuir modificações, confira as regras atuais do jogo. O uso é por sua conta e risco; este projeto não contorna autenticação nem fornece credenciais.

## Licença

O `package.json` declara a licença MIT para este projeto. Dependências e recursos de terceiros continuam sujeitos às respectivas licenças.
