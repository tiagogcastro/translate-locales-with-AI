
# Translate Locales with AI

Automatize a tradução dos seus arquivos de internacionalização utilizando inteligência artificial com AWS Bedrock.

Este projeto permite traduzir arquivos JSON de múltiplos idiomas (locales) de forma simples e rápida, integrando com serviços de IA da AWS.

---

## Funcionalidades

- Tradução automática de arquivos JSON de i18n.
- Suporte a múltiplos idiomas (pt-BR, en, es, etc).
- Integração com AWS Bedrock.
- Fácil configuração e execução.

---

## Estrutura do Projeto

```
src/
├── locales/         # Arquivos de tradução por idioma
│   ├── en/
│   ├── es/
│   └── pt-BR/
├── services/        # Serviços de integração (ex: AWS)
├── index.ts         # Arquivo principal
├── aws.ts           # Configuração AWS
.env                 # Variáveis de ambiente
.env.template        # Exemplo de variáveis de ambiente
```

---

## Como Executar

1. Instale as dependências:

```bash
npm install
```

2. Configure suas credenciais AWS no arquivo `.env` baseado no `.env.template`.

3. Execute o projeto:

```bash
npm run dev
```

---

## Tecnologias Utilizadas

- Node.js
- TypeScript
- AWS SDK (Bedrock)
- Dotenv

---

## Autor

Desenvolvido por [Tiago Gonçalves de Castro](https://github.com/tiagogcastro) 🚀
