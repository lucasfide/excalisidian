# Excalisidian privacy policy

Last updated: [[DATA_DE_PUBLICACAO]]

This is a translation of the Brazilian Portuguese original (`politica-de-privacidade.md`). If the two versions differ, the Portuguese version prevails for people in Brazil.

## In short

- Without an account, Excalisidian sends us no data about you. Your notes, diagrams and tasks stay on your computer. We have no telemetry, usage analytics or error reporting.
- The app checks GitHub to see whether a new version exists. This shows your IP address to GitHub.
- With an account, we store your e-mail, your plan and a scrambled version of your proof of identity. We never store your password. By law, we also keep access records (IP, date and time) for 6 months.
- In sync, content, file names and the vault name go encrypted. We cannot read them. We only see how many packets exist, their approximate size and when they arrived.
- In Excalisidian AI, the text of your notes passes through our server on its way to the AI supplier. We neither store nor log it. The supplier may be outside Brazil.
- In AI with your own key, the text goes straight from your computer to the provider you chose, without passing through us.
- You can ask for access, correction or deletion of your data at [[EMAIL_CONTATO]].

## 1. Who the controller is and how to reach us

The controller of the data handled by Excalisidian's online services is:

- Company name: [[RAZAO_SOCIAL]]
- Brazilian company tax ID (CNPJ): [[CNPJ]]
- Address: [[ENDERECO]]
- E-mail: [[EMAIL_CONTATO]]

Data protection officer ("encarregado", LGPD art. 41): [[NOME_DO_ENCARREGADO]], at [[EMAIL_CONTATO]].

This policy covers the Excalisidian app, the website at excalisidian.com and the optional online services (account, sync and Excalisidian AI). It follows the Brazilian General Data Protection Law (LGPD, Law 13,709/2018) and, for people in the European Union, the GDPR (Regulation 2016/679). The contract rules are in the [Terms of use](/en/terms/).

## 2. What data we handle, from whom, for what, and on which legal basis

By default Excalisidian is a local app. We only handle data of our own when you use an online service or visit the website.

| Who you are | Data | Purpose | Legal basis (LGPD art. 7 / GDPR art. 6) |
|---|---|---|---|
| **You use the app without an account** | Nothing is sent to us. Notes, diagrams, tasks and settings stay only on your computer. The only automatic connection is the update check to GitHub (section 3). | Keep the app up to date and secure. | Legitimate interest (art. 7, IX / art. 6(1)(f)), for the update check. |
| **You create an account** | E-mail; proof of identity derived from the password, stored only as a slow hash; plan and AI tier; creation date; active sessions (stored as a hash of the token, with an expiry date). | Create and maintain the account, sign in, apply the plan. | Performance of a contract (art. 7, V / art. 6(1)(b)). |
| **You create an account, sign in or use the account** | Access records: IP address, date and time (in UTC) and the type of event (create account, sign in, renew the session and account use, at most 1 record per hour for each account and IP). | Comply with the law that requires keeping application access records. | Legal obligation (art. 7, II / art. 6(1)(c)). |
| **You sync a vault** | Encrypted packets of changes; encrypted vault name; the vault key locked in an envelope that only you can open; number of packets, approximate size of each and when they arrived. | Store the packets and deliver them to your other computers. | Performance of a contract (art. 7, V / art. 6(1)(b)). |
| **You use Excalisidian AI** | The text the app sends in the request (excerpts and summaries of notes, your conversation with the agent), which only passes through the server; per account and per month, only numbers: cost, number of requests and input and output tokens; one technical log line with no identification (section 7). | Relay the request to the AI supplier, return the answer and count credits. | Performance of a contract (art. 7, V / art. 6(1)(b)). The request only leaves after you set up the AI and accept the agent's invitation or start a conversation. |
| **You use AI with your own key** | Nothing passes through us. The text and your key go straight from your computer to the chosen provider. | We do not handle this data. | The processing is between you and the provider, which is responsible for it. |
| **You visit the website** | The server hosting the site may record your IP address and technical connection data. The site uses no cookies or analytics tools (section 11). | Deliver the page and keep the site secure. | Legitimate interest (art. 7, IX / art. 6(1)(f)). |
| **You buy a plan** | The payment intermediary handles your card or other payment method details. We receive the confirmation and the state of the subscription (plan, period, status) and the data needed to issue tax documents. We do not see the card number. | Charge, renew, refund and meet tax obligations. | Performance of a contract (art. 7, V / art. 6(1)(b)) and legal obligation (art. 7, II / art. 6(1)(c)). |
| **You contact support** | Your e-mail and the content of your message. | Reply, solve the problem, refund. | Performance of a contract and legitimate interest (art. 7, V and IX / art. 6(1)(b) and (f)). |

We do not sell personal data. We do not use your data for advertising. We make no automated decisions with legal effect on you: AI answers are text suggestions.

## 3. What the app does on its own

We checked in the app's code what it sends over the network. Without an account and without the AI agent set up, there are only two things:

- **Update check.** A few seconds after you open a vault, and when you ask, the app checks the address where app versions are published on GitHub (GitHub Releases). GitHub, which belongs to Microsoft, sees your IP address and technical connection data. When you download an update or the installer, the same happens. GitHub has its own privacy policy.
- **Images from internet addresses.** If you yourself paste into a note an image that points to an internet address, the app loads the image from that address, and the originating site sees your IP. Images stored in the vault make no connection at all.

The app has no telemetry, usage analytics, automatic error reporting or device identifier. Errors stay only on your computer.

Connections for account, sync and Excalisidian AI only happen after you sign in and use the service. The AI agent comes turned off and no call is made without your setup and your acceptance.

## 4. Sync: what the server sees and what it does not

Sync is end-to-end encrypted (AES-256-GCM). The key comes from your password, inside your computer, and never leaves it.

| The server sees | The server does not see |
|---|---|
| Your e-mail and your plan | File or folder names, content |
| How many synced vaults the account has | The vault name (it goes encrypted) |
| How many packets each vault has, the approximate size of each and when they arrived | How many notes exist, which ones changed, how many changed per packet |
| How many sessions of your account send data | Your password, the vault key and the key that protects it |

Packet sizes are rounded up in steps to hide the exact size. Even so, the size and timing of uploads show the server, roughly, how much and when you write. This is a limit of any sync service and we make a point of stating it.

## 5. Excalisidian AI

When you use Excalisidian AI, the app sends the request to our server, with your session. The server checks your plan and credits and relays the request to OpenRouter, which forwards it to an AI inference provider. The answer comes back the same way.

- **What passes through:** the text needed for the request, such as excerpts of notes, summaries, the memory you confirmed and your conversation with the agent.
- **What we store:** none of that text. We do not write it to a database or to a log. We store, per account and per month, only numbers: cost, number of requests and input and output tokens, to count credits.
- **Providers:** we ask OpenRouter to use only providers that declare they neither store data nor train models on it (the `data_collection: deny` parameter). This depends on those providers' declarations and on OpenRouter's routing. OpenRouter and each provider have their own policies.

The six providers for your own key that the app supports are: Anthropic, OpenAI, Google Gemini, OpenRouter, Alibaba (DashScope) and Ollama (which runs on your computer). You can also enter an address of your own. With your own key, the text of the selected notes and your key go from your computer straight to the provider, and we do not receive them.

## 6. International data transfers

The online services' data is stored on a server hosted by [[HOSPEDAGEM_DO_SERVIDOR]].

An Excalisidian AI request may be processed outside Brazil and outside the European Union, including in countries without an adequacy decision. OpenRouter is in the United States. The provider that runs the model may be in another country, including China, and we cannot always know, before each request, where it is.

The safeguards that actually exist are these:

- only providers that declare they neither store nor train on data (`data_collection: deny`);
- none of the text is stored or logged on our server;
- the AI agent is optional, comes turned off, and only sends something after your acceptance;
- AI with your own key avoids our server altogether, and with Ollama nothing leaves your computer.

The transfer is necessary to provide the service you contracted (LGPD, art. 33, IX, together with art. 7, V; GDPR, art. 49(1)(b)). If you do not want the text of your notes to leave your computer, use only the local app or Ollama.

## 7. Technical logs

The server logs each request with the method, the route without parameters, the response code and the duration. It never logs e-mail, token, proof of identity, request body or vault identifier.

For each AI request that reaches the supplier, there is one extra line with technical data: the name of the logical model, whether it succeeded or failed, the name of the provider that answered, a generation identifier, the number of tokens and the cost. That line carries no e-mail, account identifier, token, key or message text.

The server's ordinary log, described above, contains no IP address.

**Access records.** Separately from that log, and because the Brazilian Internet Civil Framework (Law 12,965/2014, art. 15) requires it, we keep application access records, confidentially and in a controlled environment. Each record has the IP address, the date and time (in UTC) and the event: create account, sign in, renew the session or use the account. The use record is made at most once per hour for each account and IP. They are kept for 6 months and then deleted automatically. They are only handed to an authority by court order. The legal basis is legal obligation (LGPD, art. 7, II; GDPR, art. 6(1)(c)). These records remain stored for up to 6 months even if you delete the account, because the law requires it.

The IP address is also used to serve the connection and to limit sign-in attempts (at most 10 per minute per IP and per e-mail). That counter lives only in memory and disappears when the server restarts.

## 8. How long we keep each thing

| Data | How long |
|---|---|
| Account (e-mail, plan, hash of the proof of identity) | Until you ask for the account to be deleted. |
| Session | Valid for 30 days, renewed automatically while you use the app. We store only the hash of the token. Signing out ends the session. |
| Encrypted sync packets | While the subscription is active. After it ends, they may be deleted after 90 days. If you subscribe again before then, sync continues from where it stopped. You can ask for deletion at any time, and the app also has a "Delete" button in the vault list. |
| AI credit counters (numbers per month) | While the account exists. |
| Text of notes sent to Excalisidian AI | Not stored. |
| Access records (IP, date and time, event) | 6 months, then deleted automatically. They stay even if the account is deleted. |
| Server backups | 7 days. A deleted item may still exist in backups until that period passes. |
| Technical request logs | No personal data. They stay in the server's system log for as long as the system keeps them. |
| Payment data | Kept by the payment intermediary. Tax documents are kept for the period the law requires. |
| Support messages | For as long as needed to resolve the matter and meet legal obligations. |

## 9. Who we share data with (processors and sub-processors)

We only share what is needed to provide the service:

- **[[HOSPEDAGEM_DO_SERVIDOR]]:** hosts the account, sync and AI server. Holds the encrypted sync data and the accounts database.
- **OpenRouter** and the **AI inference providers** it forwards to, limited to those that declare they neither store nor train on data: receive the text of Excalisidian AI requests.
- **GitHub:** distributes the app and updates. Sees the IP of whoever downloads or checks for updates.
- **Payment intermediary** (to be decided; this policy will be updated with its name before the first charge): processes payments and is responsible for card data.
- **Website hosting:** serves the pages of excalisidian.com.

We may also disclose data if a law or an order from a competent authority requires it.

## 10. Your rights

Under the LGPD (art. 18) and, where it applies, the GDPR, you can ask for:

- confirmation that we handle data about you, and access to it;
- correction of incomplete or wrong data;
- anonymization, blocking or deletion of unnecessary data or data handled in breach of the law;
- data portability;
- deletion of data handled on the basis of your consent, and deletion of your account;
- information about who we share data with;
- information about the possibility of not giving consent and its consequences;
- withdrawal of consent, when the processing is based on it;
- objection to processing based on legitimate interest;
- restriction of processing (GDPR).

How to ask: write to [[EMAIL_CONTATO]] from the account e-mail, so we know it is you. We reply within 15 days.

Some practical notes:

- **Your files** are already with you, on your computer, in Markdown. We have no readable copy of them.
- **Cloud copy:** because it is encrypted and we cannot open it, we cannot export it in a readable format. We can delete it.
- **Deleting the account:** ask at [[EMAIL_CONTATO]], from the account e-mail. Within 15 days we delete the account, the sessions, the vaults in the cloud and the credit counters. The account disappears from backup copies within 7 days after that, when the backup rotates. The exception is the access records (section 7): they stay until they complete 6 months, because the law requires it.
- **Changing the e-mail:** today the app has no screen for this. If the e-mail is wrong, contact us.
- **Complaints:** you can complain to the Brazilian National Data Protection Authority (ANPD) or, if you are in the European Union, to the data protection authority of your country.

## 11. Cookies

The excalisidian.com website uses no cookies, analytics tools, or third-party fonts or scripts. The site's fonts and images are served by the site itself. The demo page on the site keeps what you type only in the page's memory, and nothing is sent to any service. The app does not use cookies either. Links to GitHub lead to a third-party site, which has its own rules.

If this changes, we will update this policy and ask for your consent where the law requires it.

## 12. Security

Measures we actually use:

- encrypted connection (HTTPS) with a valid certificate;
- end-to-end encryption in sync (AES-256-GCM), with a key derived from the password by Argon2id, inside your computer;
- the password is never sent: the server receives only a proof derived from it and stores only a slow hash (scrypt);
- session tokens stored on the server only as a hash, and on your computer in the operating system's credential store, where the system offers one;
- limits on sign-in attempts, on AI requests per minute and on space per account;
- the server runs with reduced privileges, and the AI supplier's key is kept out of the repository and the app;
- daily backup, kept for 7 days. It sits on the same server, so it protects against software errors but not against loss of the whole server.

A limit you should know about: the API keys of AI providers that you configure yourself are kept in an app configuration file on your computer, with no extra encryption. Anyone with access to your operating system user account can read them.

No system is completely secure. If an incident occurs that may cause you a relevant risk, we will notify you and the competent authority within the legal deadlines.

## 13. Children and teenagers

The online services are not intended for people under 18 without the authorization of a legal guardian. We do not create accounts for children under 13. If we find such an account, we will delete it. If you are the guardian of a minor and believe they created an account, contact us.

## 14. Changes to this policy

We may update this policy. For relevant changes, we notify you by e-mail or in the app with reasonable notice. The "Last updated" date at the top shows the version in force.

## 15. Contact

Questions, rights requests and privacy matters: [[EMAIL_CONTATO]].

[[RAZAO_SOCIAL]] · CNPJ [[CNPJ]] · [[ENDERECO]] · Data protection officer: [[NOME_DO_ENCARREGADO]]
