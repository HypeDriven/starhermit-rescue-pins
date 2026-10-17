/* Rescue Pins — translation tables (see js/i18n.js).
 * Each row: [English key, es-419, de-DE, fr-FR, pt-BR, it-IT]. en-GB, es-ES and
 * fr-CA list only where they differ from en-US, es-419 and fr-FR.
 * "Rescue Pins" and "StarHermit" are names and stay as they are. The Graphics
 * strings live in js/gfx-i18n.js and the account strings in js/sh-i18n.js;
 * both follow the same game language.
 */
(function (root) {
  'use strict';
  var ROWS = [
    // ---- captions
    ['click', 'clic', 'Klick', 'clic', 'clique', 'clic'],
    ['pin pulled', 'clavija retirada', 'Stift gezogen', 'goupille retirée', 'pino puxado', 'perno tirato'],
    ['liquid flowing', 'líquido fluyendo', 'Flüssigkeit fließt', 'liquide qui coule', 'líquido escorrendo', 'liquido che scorre'],
    ['steam hiss', 'silbido de vapor', 'Dampfzischen', 'sifflement de vapeur', 'chiado de vapor', 'sibilo di vapore'],
    ['victory chime', 'campanilla de victoria', 'Siegesklang', 'carillon de victoire', 'sino de vitória', 'rintocco di vittoria'],
    ['low fail tone', 'tono grave de fallo', 'tiefer Fehlton', 'tonalité grave d’échec', 'tom grave de falha', 'tono grave di fallimento'],
    ['error buzz', 'zumbido de error', 'Fehlersummen', 'bourdonnement d’erreur', 'zumbido de erro', 'ronzio di errore'],
    ['rewind', 'rebobinar', 'Zurückspulen', 'retour arrière', 'retroceder', 'riavvolgi'],

    // ---- HUD, coach, objectives
    ['Daily score kept on your profile.', 'Puntuación diaria guardada en tu perfil.', 'Tagespunktzahl in deinem Profil gespeichert.', 'Score du jour enregistré dans votre profil.', 'Pontuação diária salva no seu perfil.', 'Punteggio giornaliero salvato nel tuo profilo.'],
    ['Daily score kept locally.', 'Puntuación diaria guardada en este dispositivo.', 'Tagespunktzahl lokal gespeichert.', 'Score du jour enregistré sur l’appareil.', 'Pontuação diária salva no dispositivo.', 'Punteggio giornaliero salvato sul dispositivo.'],
    ['Every villager is safe.', 'Todos los aldeanos están a salvo.', 'Alle Dorfbewohner sind in Sicherheit.', 'Tous les villageois sont sains et saufs.', 'Todos os aldeões estão a salvo.', 'Tutti gli abitanti sono al sicuro.'],
    ['Rescue {n} villager with water. Keep lava away.', 'Rescata a {n} aldeano con agua. Mantén lejos la lava.', 'Rette {n} Dorfbewohner mit Wasser. Halte die Lava fern.', 'Sauvez {n} villageois avec l’eau. Tenez la lave à l’écart.', 'Resgate {n} aldeão com água. Mantenha a lava longe.', 'Salva {n} abitante con l’acqua. Tieni lontana la lava.'],
    ['Rescue {n} villagers with water. Keep lava away.', 'Rescata a {n} aldeanos con agua. Mantén lejos la lava.', 'Rette {n} Dorfbewohner mit Wasser. Halte die Lava fern.', 'Sauvez {n} villageois avec l’eau. Tenez la lave à l’écart.', 'Resgate {n} aldeões com água. Mantenha a lava longe.', 'Salva {n} abitanti con l’acqua. Tieni lontana la lava.'],
    ['Tap a brass pin to select it — or use the buttons under “Pins you can pull”, or the arrow keys.', 'Toca una clavija de latón para seleccionarla, o usa los botones de “Clavijas que puedes retirar” o las flechas.', 'Tippe auf einen Messingstift, um ihn auszuwählen – oder nutze die Tasten unter „Ziehbare Stifte“ oder die Pfeiltasten.', 'Touchez une goupille en laiton pour la sélectionner — ou utilisez les boutons sous « Goupilles à retirer », ou les flèches.', 'Toque num pino de latão para selecioná-lo — ou use os botões em “Pinos que você pode puxar” ou as setas.', 'Tocca un perno d’ottone per selezionarlo, oppure usa i pulsanti sotto “Perni che puoi tirare” o le frecce.'],
    ['Click or hover a brass pin to select it — or use the buttons under “Pins you can pull”, or the arrow keys.', 'Haz clic o pasa el cursor sobre una clavija de latón para seleccionarla, o usa los botones de “Clavijas que puedes retirar” o las flechas.', 'Klicke auf einen Messingstift oder fahre darüber, um ihn auszuwählen – oder nutze die Tasten unter „Ziehbare Stifte“ oder die Pfeiltasten.', 'Cliquez ou survolez une goupille en laiton pour la sélectionner — ou utilisez les boutons sous « Goupilles à retirer », ou les flèches.', 'Clique ou passe o cursor sobre um pino de latão para selecioná-lo — ou use os botões em “Pinos que você pode puxar” ou as setas.', 'Fai clic o passa sopra un perno d’ottone per selezionarlo, oppure usa i pulsanti sotto “Perni che puoi tirare” o le frecce.'],
    ['Selected. Now tap it again to pull it. One press on its button in the list also pulls it.', 'Seleccionada. Tócala otra vez para retirarla. Pulsar su botón en la lista también la retira.', 'Ausgewählt. Tippe ihn erneut an, um ihn zu ziehen. Ein Druck auf seine Taste in der Liste zieht ihn ebenfalls.', 'Sélectionnée. Touchez-la à nouveau pour la retirer. Un appui sur son bouton dans la liste la retire aussi.', 'Selecionado. Toque de novo para puxá-lo. Um toque no botão dele na lista também o puxa.', 'Selezionato. Toccalo di nuovo per tirarlo. Anche il suo pulsante nell’elenco lo tira.'],
    ['Selected. Now click it again or press Enter to pull it. One press on its button in the list also pulls it.', 'Seleccionada. Haz clic otra vez o pulsa Intro para retirarla. Pulsar su botón en la lista también la retira.', 'Ausgewählt. Klicke erneut oder drücke Eingabe, um ihn zu ziehen. Ein Druck auf seine Taste in der Liste zieht ihn ebenfalls.', 'Sélectionnée. Cliquez à nouveau ou appuyez sur Entrée pour la retirer. Un appui sur son bouton dans la liste la retire aussi.', 'Selecionado. Clique de novo ou aperte Enter para puxá-lo. Um clique no botão dele na lista também o puxa.', 'Selezionato. Fai di nuovo clic o premi Invio per tirarlo. Anche il suo pulsante nell’elenco lo tira.'],
    ['Water falls and spreads sideways: blue water rescues villagers, orange lava is deadly. H = hint · Esc = pause & settings.', 'El agua cae y se extiende hacia los lados: el agua azul rescata aldeanos, la lava naranja es mortal. H = pista · Esc = pausa y configuración.', 'Wasser fällt und breitet sich seitlich aus: Blaues Wasser rettet Dorfbewohner, orange Lava ist tödlich. H = Tipp · Esc = Pause & Einstellungen.', 'L’eau tombe et s’étale sur les côtés : l’eau bleue sauve les villageois, la lave orange est mortelle. H = indice · Échap = pause et paramètres.', 'A água cai e se espalha para os lados: água azul resgata aldeões, lava laranja é mortal. H = dica · Esc = pausa e configurações.', 'L’acqua cade e si allarga ai lati: l’acqua blu salva gli abitanti, la lava arancione è mortale. H = indizio · Esc = pausa e impostazioni.'],
    ['Lesson {n} of {total}', 'Lección {n} de {total}', 'Lektion {n} von {total}', 'Leçon {n} sur {total}', 'Lição {n} de {total}', 'Lezione {n} di {total}'],
    ['How to play · {n} of 3', 'Cómo jugar · {n} de 3', 'So wird gespielt · {n} von 3', 'Comment jouer · {n} sur 3', 'Como jogar · {n} de 3', 'Come si gioca · {n} di 3'],
    ['Choose a pin', 'Elige una clavija', 'Wähle einen Stift', 'Choisissez une goupille', 'Escolha um pino', 'Scegli un perno'],
    ['Pull it', 'Retírala', 'Zieh ihn', 'Retirez-la', 'Puxe-o', 'Tiralo'],
    ['Watch the flow', 'Observa el flujo', 'Beobachte den Fluss', 'Observez l’écoulement', 'Observe o fluxo', 'Osserva il flusso'],
    ['Got it', 'Entendido', 'Verstanden', 'Compris', 'Entendi', 'Capito'],
    ['This day is excluded from ranking (defective content).', 'Este día no cuenta para la clasificación (contenido defectuoso).', 'Dieser Tag ist von der Wertung ausgenommen (fehlerhafter Inhalt).', 'Ce jour est exclu du classement (contenu défectueux).', 'Este dia está fora do ranking (conteúdo defeituoso).', 'Questo giorno è escluso dalla classifica (contenuto difettoso).'],
    ['Ready…', 'Listo…', 'Bereit …', 'Prêt…', 'Pronto…', 'Pronti…'],
    ['Cannot pull that pin: {reason}', 'No se puede retirar esa clavija: {reason}', 'Dieser Stift kann nicht gezogen werden: {reason}', 'Impossible de retirer cette goupille : {reason}', 'Não é possível puxar esse pino: {reason}', 'Impossibile tirare quel perno: {reason}'],
    ['Signed in as {name} · {sync}', 'Sesión iniciada como {name} · {sync}', 'Angemeldet als {name} · {sync}', 'Connecté en tant que {name} · {sync}', 'Conectado como {name} · {sync}', 'Accesso come {name} · {sync}'],
    ['cloud save', 'guardado en la nube', 'Cloud-Spielstand', 'sauvegarde en ligne', 'salvamento na nuvem', 'salvataggio cloud'],
    ['Progress is stored locally (versioned, checksummed).', 'El progreso se guarda en este dispositivo (con versión y suma de verificación).', 'Der Fortschritt wird lokal gespeichert (versioniert, mit Prüfsumme).', 'La progression est enregistrée sur l’appareil (versionnée, avec somme de contrôle).', 'O progresso fica salvo no dispositivo (com versão e soma de verificação).', 'I progressi sono salvati sul dispositivo (con versione e checksum).'],
    ['Undo: {reason}', 'Deshacer: {reason}', 'Rückgängig: {reason}', 'Annuler : {reason}', 'Desfazer: {reason}', 'Annulla: {reason}'],
    ['Try pin {id} — it is on a winning line from here.', 'Prueba la clavija {id}: desde aquí lleva a la victoria.', 'Versuch Stift {id} – von hier aus führt er zum Sieg.', 'Essayez la goupille {id} — elle mène à la victoire d’ici.', 'Tente o pino {id} — daqui ele leva à vitória.', 'Prova il perno {id}: da qui porta alla vittoria.'],
    ['Hint search limit reached — try another move.', 'Se alcanzó el límite de búsqueda de pistas: prueba otro movimiento.', 'Suchlimit für Tipps erreicht – versuch einen anderen Zug.', 'Limite de recherche d’indice atteinte — essayez un autre coup.', 'Limite de busca de dicas atingido — tente outro movimento.', 'Limite di ricerca dell’indizio raggiunto: prova un’altra mossa.'],
    ['No winning line from this position — undo (practice) or retry.', 'No hay forma de ganar desde aquí: deshaz (práctica) o reintenta.', 'Von hier aus gibt es keinen Siegesweg – nimm zurück (Training) oder versuch es erneut.', 'Aucune issue gagnante d’ici — annulez (entraînement) ou réessayez.', 'Não há caminho para a vitória daqui — desfaça (treino) ou tente de novo.', 'Nessuna via vincente da qui: annulla (allenamento) o riprova.'],
    ['No saved game to continue.', 'No hay partida guardada para continuar.', 'Kein gespeichertes Spiel zum Fortsetzen.', 'Aucune partie enregistrée à reprendre.', 'Não há jogo salvo para continuar.', 'Nessuna partita salvata da continuare.'],
    ['Saved game was corrupted and could not be restored.', 'La partida guardada estaba dañada y no se pudo restaurar.', 'Das gespeicherte Spiel war beschädigt und konnte nicht wiederhergestellt werden.', 'La partie enregistrée était corrompue et n’a pas pu être restaurée.', 'O jogo salvo estava corrompido e não pôde ser restaurado.', 'La partita salvata era danneggiata e non è stato possibile ripristinarla.'],
    ['3D rendering (WebGL) is unavailable in this browser. You can still play using the pin list in the status rail — every action has a text equivalent.', 'La representación 3D (WebGL) no está disponible en este navegador. Aún puedes jugar con la lista de clavijas del panel de estado: cada acción tiene un equivalente en texto.', '3D-Darstellung (WebGL) ist in diesem Browser nicht verfügbar. Du kannst trotzdem mit der Stiftliste in der Statusleiste spielen – jede Aktion gibt es auch als Text.', 'Le rendu 3D (WebGL) n’est pas disponible dans ce navigateur. Vous pouvez quand même jouer avec la liste des goupilles du panneau d’état — chaque action a un équivalent texte.', 'A renderização 3D (WebGL) não está disponível neste navegador. Você ainda pode jogar com a lista de pinos no painel de status — cada ação tem um equivalente em texto.', 'Il rendering 3D (WebGL) non è disponibile in questo browser. Puoi comunque giocare con l’elenco dei perni nel pannello di stato: ogni azione ha un equivalente testuale.'],
    ['Graphics context was lost. Your progress is saved; reload to restore 3D view.', 'Se perdió el contexto gráfico. Tu progreso está guardado; recarga para recuperar la vista 3D.', 'Der Grafikkontext ging verloren. Dein Fortschritt ist gespeichert; lade neu, um die 3D-Ansicht wiederherzustellen.', 'Le contexte graphique a été perdu. Votre progression est enregistrée ; rechargez pour retrouver la vue 3D.', 'O contexto gráfico foi perdido. Seu progresso está salvo; recarregue para restaurar a visão 3D.', 'Il contesto grafico è andato perso. I progressi sono salvati; ricarica per ripristinare la vista 3D.'],
    ['Daily (excluded)', 'Diario (excluido)', 'Täglich (ausgenommen)', 'Quotidien (exclu)', 'Diário (excluído)', 'Giornaliera (esclusa)'],
    ['Daily {date}', 'Diario {date}', 'Täglich {date}', 'Quotidien {date}', 'Diário {date}', 'Giornaliera {date}'],

    // ---- shell
    ['Objective and progression', 'Objetivo y progreso', 'Ziel und Fortschritt', 'Objectif et progression', 'Objetivo e progresso', 'Obiettivo e avanzamento'],
    ['Actions and status', 'Acciones y estado', 'Aktionen und Status', 'Actions et état', 'Ações e status', 'Azioni e stato'],
    ['Primary actions', 'Acciones principales', 'Hauptaktionen', 'Actions principales', 'Ações principais', 'Azioni principali'],
    ['Objective', 'Objetivo', 'Ziel', 'Objectif', 'Objetivo', 'Obiettivo'],
    ['Score', 'Puntos', 'Punkte', 'Score', 'Pontos', 'Punti'],
    ['Errors', 'Errores', 'Fehler', 'Erreurs', 'Erros', 'Errori'],
    ['Results', 'Resultados', 'Ergebnisse', 'Résultats', 'Resultados', 'Risultati'],
    ['Audio captions', 'Subtítulos de audio', 'Audio-Untertitel', 'Sous-titres audio', 'Legendas de áudio', 'Sottotitoli audio'],
    ['Board state in text', 'Estado del tablero en texto', 'Spielfeld als Text', 'État du plateau en texte', 'Estado do tabuleiro em texto', 'Stato del tavolo in testo'],
    ['Guidance', 'Guía', 'Anleitung', 'Conseils', 'Orientação', 'Guida'],

    // ---- title, modes, journey, profile
    ['Pull the pins. Spare the villagers.', 'Retira las clavijas. Salva a los aldeanos.', 'Zieh die Stifte. Rette die Dorfbewohner.', 'Retirez les goupilles. Épargnez les villageois.', 'Puxe os pinos. Poupe os aldeões.', 'Tira i perni. Salva gli abitanti.'],
    ['▶ Play', '▶ Jugar', '▶ Spielen', '▶ Jouer', '▶ Jogar', '▶ Gioca'],
    ['Continue saved game', 'Continuar partida guardada', 'Gespeichertes Spiel fortsetzen', 'Reprendre la partie enregistrée', 'Continuar jogo salvo', 'Continua la partita salvata'],
    ['Signed in as {name}', 'Sesión iniciada como {name}', 'Angemeldet als {name}', 'Connecté en tant que {name}', 'Conectado como {name}', 'Accesso come {name}'],
    ['Daily Challenge', 'Desafío diario', 'Tägliche Herausforderung', 'Défi du jour', 'Desafio diário', 'Sfida giornaliera'],
    ['Journey', 'Travesía', 'Reise', 'Voyage', 'Jornada', 'Viaggio'],
    ['Profile & Progress', 'Perfil y progreso', 'Profil & Fortschritt', 'Profil et progression', 'Perfil e progresso', 'Profilo e progressi'],
    ['Journey progress: {n}/40 stages cleared', 'Progreso de la travesía: {n}/40 etapas superadas', 'Reisefortschritt: {n}/40 Etappen geschafft', 'Progression du voyage : {n}/40 étapes réussies', 'Progresso da jornada: {n}/40 etapas concluídas', 'Avanzamento del viaggio: {n}/40 tappe superate'],
    ['New here? Press Play, then pick Learn for five short lessons.', '¿Eres nuevo? Pulsa Jugar y elige Aprender para cinco lecciones cortas.', 'Neu hier? Drücke Spielen und wähle Lernen für fünf kurze Lektionen.', 'Nouveau ? Appuyez sur Jouer, puis choisissez Apprendre pour cinq courtes leçons.', 'Primeira vez? Aperte Jogar e escolha Aprender para cinco lições curtas.', 'Sei nuovo? Premi Gioca e scegli Impara per cinque brevi lezioni.'],
    ['How to play', 'Cómo jugar', 'So wird gespielt', 'Comment jouer', 'Como jogar', 'Come si gioca'],
    ['Choose a mode', 'Elige un modo', 'Modus wählen', 'Choisissez un mode', 'Escolha um modo', 'Scegli una modalità'],
    ['First time? Learn teaches the controls and rules one at a time.', '¿Primera vez? Aprender enseña los controles y las reglas una a una.', 'Zum ersten Mal hier? Lernen erklärt Steuerung und Regeln Schritt für Schritt.', 'Première fois ? Apprendre enseigne les commandes et les règles une à une.', 'Primeira vez? Aprender ensina os controles e as regras um de cada vez.', 'Prima volta? Impara insegna comandi e regole uno alla volta.'],
    ['Learn', 'Aprender', 'Lernen', 'Apprendre', 'Aprender', 'Impara'],
    ['Five short lessons. One rule at a time. Unranked.', 'Cinco lecciones cortas. Una regla a la vez. Sin clasificación.', 'Fünf kurze Lektionen. Eine Regel nach der anderen. Ungewertet.', 'Cinq courtes leçons. Une règle à la fois. Non classé.', 'Cinco lições curtas. Uma regra por vez. Sem ranking.', 'Cinque brevi lezioni. Una regola alla volta. Non classificato.'],
    ['40 authored castles across five themes.', '40 castillos diseñados en cinco temas.', '40 gestaltete Burgen in fünf Themen.', '40 châteaux conçus à la main sur cinq thèmes.', '40 castelos criados em cinco temas.', '40 castelli d’autore in cinque temi.'],
    ['One shared castle per UTC day. Ranked.', 'Un castillo compartido por día UTC. Clasificatorio.', 'Eine gemeinsame Burg pro UTC-Tag. Gewertet.', 'Un château commun par jour UTC. Classé.', 'Um castelo compartilhado por dia UTC. Ranqueado.', 'Un castello condiviso per giorno UTC. Classificato.'],
    ['Practice', 'Práctica', 'Training', 'Entraînement', 'Treino', 'Allenamento'],
    ['Pick a stage, undo allowed, unranked.', 'Elige una etapa, deshacer permitido, sin clasificación.', 'Wähle eine Etappe, Rückgängig erlaubt, ungewertet.', 'Choisissez une étape, annulation permise, non classé.', 'Escolha uma etapa, desfazer permitido, sem ranking.', 'Scegli una tappa, annulla consentito, non classificato.'],
    ['Recommended', 'Recomendado', 'Empfohlen', 'Recommandé', 'Recomendado', 'Consigliato'],
    ['Back', 'Volver', 'Zurück', 'Retour', 'Voltar', 'Indietro'],
    ['par {n}', 'par {n}', 'Par {n}', 'par {n}', 'par {n}', 'par {n}'],
    ['move limit {n}', 'límite de movimientos {n}', 'Zuglimit {n}', 'limite de coups {n}', 'limite de movimentos {n}', 'limite di mosse {n}'],
    ['mastery test', 'prueba de maestría', 'Meisterprüfung', 'épreuve de maîtrise', 'prova de maestria', 'prova di maestria'],
    ['best {n}', 'mejor {n}', 'Bestwert {n}', 'record {n}', 'melhor {n}', 'record {n}'],
    ['Stages cleared: {n}/40', 'Etapas superadas: {n}/40', 'Geschaffte Etappen: {n}/40', 'Étapes réussies : {n}/40', 'Etapas concluídas: {n}/40', 'Tappe superate: {n}/40'],
    ['Tutorial: complete', 'Tutorial: completado', 'Tutorial: abgeschlossen', 'Tutoriel : terminé', 'Tutorial: concluído', 'Tutorial: completato'],
    ['Tutorial: not finished', 'Tutorial: sin terminar', 'Tutorial: nicht abgeschlossen', 'Tutoriel : non terminé', 'Tutorial: não concluído', 'Tutorial: non completato'],
    ['Mastery track: {n}/{total} theme-final stages cleared', 'Ruta de maestría: {n}/{total} etapas finales de tema superadas', 'Meisterpfad: {n}/{total} Themen-Finaletappen geschafft', 'Parcours de maîtrise : {n}/{total} étapes finales de thème réussies', 'Trilha de maestria: {n}/{total} etapas finais de tema concluídas', 'Percorso di maestria: {n}/{total} tappe finali di tema superate'],
    ['Achievements', 'Logros', 'Erfolge', 'Succès', 'Conquistas', 'Obiettivi'],

    // ---- results
    ['Every villager reached safety.', 'Todos los aldeanos llegaron a salvo.', 'Alle Dorfbewohner sind in Sicherheit.', 'Tous les villageois sont à l’abri.', 'Todos os aldeões chegaram a salvo.', 'Tutti gli abitanti sono in salvo.'],
    ['Lava reached a villager.', 'La lava alcanzó a un aldeano.', 'Lava hat einen Dorfbewohner erreicht.', 'La lave a atteint un villageois.', 'A lava atingiu um aldeão.', 'La lava ha raggiunto un abitante.'],
    ['Out of moves for this stage.', 'No quedan movimientos en esta etapa.', 'Keine Züge mehr für diese Etappe.', 'Plus de coups pour cette étape.', 'Sem movimentos para esta etapa.', 'Mosse esaurite per questa tappa.'],
    ['The flow could not settle.', 'El flujo no pudo estabilizarse.', 'Der Fluss kam nicht zur Ruhe.', 'L’écoulement n’a pas pu se stabiliser.', 'O fluxo não conseguiu se estabilizar.', 'Il flusso non si è stabilizzato.'],
    ['Rescued!', '¡Rescatados!', 'Gerettet!', 'Sauvés !', 'Resgatados!', 'Salvati!'],
    ['The castle claims another…', 'El castillo se cobra otra víctima…', 'Die Burg fordert ein weiteres Opfer …', 'Le château fait une autre victime…', 'O castelo faz mais uma vítima…', 'Il castello reclama un’altra vittima…'],
    ['Villagers saved: {n}', 'Aldeanos rescatados: {n}', 'Gerettete Dorfbewohner: {n}', 'Villageois sauvés : {n}', 'Aldeões salvos: {n}', 'Abitanti salvati: {n}'],
    ['Hazards neutralized: {n}', 'Peligros neutralizados: {n}', 'Gefahren entschärft: {n}', 'Dangers neutralisés : {n}', 'Perigos neutralizados: {n}', 'Pericoli neutralizzati: {n}'],
    ['Under-par bonus: {n}', 'Bono bajo par: {n}', 'Unter-Par-Bonus: {n}', 'Bonus sous le par : {n}', 'Bônus abaixo do par: {n}', 'Bonus sotto il par: {n}'],
    ['Efficiency: {n}', 'Eficiencia: {n}', 'Effizienz: {n}', 'Efficacité : {n}', 'Eficiência: {n}', 'Efficienza: {n}'],
    ['Invalid-action penalty: {n}', 'Penalización por acciones no válidas: {n}', 'Abzug für ungültige Aktionen: {n}', 'Pénalité d’actions invalides : {n}', 'Penalidade por ações inválidas: {n}', 'Penalità per azioni non valide: {n}'],
    ['Total: {n}', 'Total: {n}', 'Gesamt: {n}', 'Total : {n}', 'Total: {n}', 'Totale: {n}'],
    ['Pins pulled: {n} (par {par})', 'Clavijas retiradas: {n} (par {par})', 'Gezogene Stifte: {n} (Par {par})', 'Goupilles retirées : {n} (par {par})', 'Pinos puxados: {n} (par {par})', 'Perni tirati: {n} (par {par})'],
    ['Achievements unlocked', 'Logros desbloqueados', 'Freigeschaltete Erfolge', 'Succès débloqués', 'Conquistas desbloqueadas', 'Obiettivi sbloccati'],
    ['Leaderboard', 'Clasificación', 'Bestenliste', 'Classement', 'Ranking', 'Classifica'],
    ['Retry', 'Reintentar', 'Nochmal', 'Réessayer', 'Tentar de novo', 'Riprova'],
    ['Next stage', 'Siguiente etapa', 'Nächste Etappe', 'Étape suivante', 'Próxima etapa', 'Tappa successiva'],
    ['Change stage', 'Cambiar etapa', 'Etappe wechseln', 'Changer d’étape', 'Trocar etapa', 'Cambia tappa'],
    ['Menu', 'Menú', 'Menü', 'Menu', 'Menu', 'Menu'],
    ['Victory. Score {n}.', 'Victoria. Puntuación: {n}.', 'Sieg. Punktzahl {n}.', 'Victoire. Score : {n}.', 'Vitória. Pontuação: {n}.', 'Vittoria. Punteggio: {n}.'],
    ['Defeat. {why}', 'Derrota. {why}', 'Niederlage. {why}', 'Défaite. {why}', 'Derrota. {why}', 'Sconfitta. {why}'],

    // ---- pause, settings
    ['Paused', 'En pausa', 'Pausiert', 'En pause', 'Pausado', 'In pausa'],
    ['Resume', 'Reanudar', 'Weiter', 'Reprendre', 'Continuar', 'Riprendi'],
    ['Audio', 'Audio', 'Audio', 'Audio', 'Áudio', 'Audio'],
    ['Music', 'Música', 'Musik', 'Musique', 'Música', 'Musica'],
    ['Effects', 'Efectos', 'Effekte', 'Effets', 'Efeitos', 'Effetti'],
    ['Ambience', 'Ambiente', 'Atmosphäre', 'Ambiance', 'Ambiente', 'Ambiente'],
    ['Mute all', 'Silenciar todo', 'Alles stumm', 'Tout couper', 'Silenciar tudo', 'Silenzia tutto'],
    ['Captions', 'Subtítulos', 'Untertitel', 'Sous-titres', 'Legendas', 'Sottotitoli'],
    ['Palette', 'Paleta', 'Palette', 'Palette', 'Paleta', 'Tavolozza'],
    ['Default', 'Predeterminada', 'Standard', 'Par défaut', 'Padrão', 'Predefinita'],
    ['Colorblind', 'Daltonismo', 'Farbenblind', 'Daltonisme', 'Daltonismo', 'Daltonismo'],
    ['High contrast', 'Alto contraste', 'Hoher Kontrast', 'Contraste élevé', 'Alto contraste', 'Contrasto elevato'],
    ['Reduced motion', 'Movimiento reducido', 'Weniger Bewegung', 'Animations réduites', 'Movimento reduzido', 'Movimento ridotto'],
    ['Larger text', 'Texto más grande', 'Größere Schrift', 'Texte plus grand', 'Texto maior', 'Testo più grande'],
    ['Controls', 'Controles', 'Steuerung', 'Commandes', 'Controles', 'Comandi'],
    ['Arrows/WASD: choose pin · Enter/Space: pull · Esc: pause/cancel · U: undo (practice) · H: hint · C: reset camera', 'Flechas/WASD: elegir clavija · Intro/Espacio: retirar · Esc: pausa/cancelar · U: deshacer (práctica) · H: pista · C: restablecer cámara', 'Pfeile/WASD: Stift wählen · Eingabe/Leertaste: ziehen · Esc: Pause/abbrechen · U: rückgängig (Training) · H: Tipp · C: Kamera zurücksetzen', 'Flèches/WASD : choisir une goupille · Entrée/Espace : retirer · Échap : pause/annuler · U : annuler (entraînement) · H : indice · C : réinitialiser la caméra', 'Setas/WASD: escolher pino · Enter/Espaço: puxar · Esc: pausar/cancelar · U: desfazer (treino) · H: dica · C: redefinir câmera', 'Frecce/WASD: scegli perno · Invio/Spazio: tira · Esc: pausa/annulla · U: annulla (allenamento) · H: indizio · C: ripristina visuale'],
    ['Left-handed tray', 'Barra para zurdos', 'Leiste für Linkshänder', 'Barre pour gauchers', 'Barra para canhotos', 'Barra per mancini'],
    ['Accessibility', 'Accesibilidad', 'Barrierefreiheit', 'Accessibilité', 'Acessibilidade', 'Accessibilità'],
    ['Every board state is mirrored as text for screen readers. No gameplay information is audio-only or color-only.', 'Cada estado del tablero se refleja en texto para lectores de pantalla. Ninguna información del juego depende solo del audio o del color.', 'Jeder Spielfeldzustand wird für Screenreader als Text gespiegelt. Keine Spielinformation ist nur hörbar oder nur farblich.', 'Chaque état du plateau est reproduit en texte pour les lecteurs d’écran. Aucune information de jeu n’est uniquement sonore ou uniquement colorée.', 'Cada estado do tabuleiro é espelhado em texto para leitores de tela. Nenhuma informação do jogo é só sonora ou só por cor.', 'Ogni stato del tavolo è riprodotto in testo per gli screen reader. Nessuna informazione di gioco è solo sonora o solo cromatica.'],
    ['Replay tutorial', 'Repetir tutorial', 'Tutorial wiederholen', 'Revoir le tutoriel', 'Repetir tutorial', 'Ripeti il tutorial'],
    ['Help', 'Ayuda', 'Hilfe', 'Aide', 'Ajuda', 'Aiuto'],
    ['Rule cards', 'Tarjetas de reglas', 'Regelkarten', 'Fiches de règles', 'Cartões de regras', 'Schede delle regole'],
    ['Leave', 'Salir', 'Verlassen', 'Quitter', 'Sair', 'Esci'],
    ['Save & quit to title', 'Guardar y salir al título', 'Speichern & zum Titel', 'Enregistrer et quitter', 'Salvar e sair para o título', 'Salva ed esci al titolo'],

    // ---- help
    ['Pull pins', 'Retirar clavijas', 'Stifte ziehen', 'Retirer les goupilles', 'Puxar pinos', 'Tirare i perni'],
    ['Tap or click a brass pin to select it, then tap it again to pull it. On a keyboard, choose a pin with {select} and press {confirm}. The pin list in the Status rail works too: one press pulls that pin.', 'Toca o haz clic en una clavija de latón para seleccionarla y vuelve a tocarla para retirarla. Con teclado, elige una clavija con {select} y pulsa {confirm}. La lista de clavijas del panel de estado también sirve: una pulsación la retira.', 'Tippe oder klicke auf einen Messingstift, um ihn auszuwählen, und tippe erneut, um ihn zu ziehen. Mit der Tastatur wählst du mit {select} und drückst {confirm}. Die Stiftliste in der Statusleiste geht auch: ein Druck zieht den Stift.', 'Touchez ou cliquez une goupille en laiton pour la sélectionner, puis touchez-la à nouveau pour la retirer. Au clavier, choisissez avec {select} et appuyez sur {confirm}. La liste des goupilles du panneau d’état marche aussi : un appui la retire.', 'Toque ou clique num pino de latão para selecioná-lo e toque de novo para puxá-lo. No teclado, escolha com {select} e aperte {confirm}. A lista de pinos no painel de status também funciona: um toque puxa o pino.', 'Tocca o fai clic su un perno d’ottone per selezionarlo, poi toccalo di nuovo per tirarlo. Con la tastiera scegli con {select} e premi {confirm}. Funziona anche l’elenco dei perni nel pannello di stato: una pressione lo tira.'],
    ['Water rescues', 'El agua rescata', 'Wasser rettet', 'L’eau sauve', 'A água resgata', 'L’acqua salva'],
    ['Water falls and flows sideways. A villager touched by water is rescued.', 'El agua cae y fluye hacia los lados. Un aldeano que toca el agua queda rescatado.', 'Wasser fällt und fließt zur Seite. Ein Dorfbewohner, den Wasser erreicht, ist gerettet.', 'L’eau tombe et coule sur les côtés. Un villageois touché par l’eau est sauvé.', 'A água cai e escorre para os lados. Um aldeão tocado pela água é resgatado.', 'L’acqua cade e scorre ai lati. Un abitante toccato dall’acqua è salvo.'],
    ['Lava kills', 'La lava mata', 'Lava tötet', 'La lave tue', 'A lava mata', 'La lava uccide'],
    ['A villager touched by lava is lost. The stage ends.', 'Un aldeano que toca la lava se pierde. La etapa termina.', 'Ein Dorfbewohner, den Lava erreicht, ist verloren. Die Etappe endet.', 'Un villageois touché par la lave est perdu. L’étape se termine.', 'Um aldeão tocado pela lava está perdido. A etapa termina.', 'Un abitante toccato dalla lava è perduto. La tappa finisce.'],
    ['Steam', 'Vapor', 'Dampf', 'Vapeur', 'Vapor', 'Vapore'],
    ['Water and lava in the same chamber neutralize into inert steam.', 'El agua y la lava en la misma cámara se neutralizan en vapor inerte.', 'Wasser und Lava in derselben Kammer werden zu harmlosem Dampf.', 'L’eau et la lave dans la même chambre se neutralisent en vapeur inerte.', 'Água e lava na mesma câmara se neutralizam em vapor inerte.', 'Acqua e lava nella stessa camera si neutralizzano in vapore inerte.'],
    ['Save villagers, waste no pins: beating par and avoiding mistakes raises your score.', 'Salva aldeanos sin gastar clavijas: superar el par y evitar errores sube tu puntuación.', 'Rette Dorfbewohner, verschwende keine Stifte: Unter Par bleiben und Fehler vermeiden erhöht deine Punktzahl.', 'Sauvez les villageois sans gaspiller de goupilles : battre le par et éviter les erreurs augmente votre score.', 'Salve aldeões sem desperdiçar pinos: bater o par e evitar erros aumenta sua pontuação.', 'Salva gli abitanti senza sprecare perni: battere il par ed evitare errori alza il punteggio.'],
    ['Stuck?', '¿Atascado?', 'Festgefahren?', 'Bloqué ?', 'Travado?', 'Bloccato?'],
    ['Press {hint} (or the Hint button) for a pin on a winning line. {pause} pauses and opens settings. {undo} undoes in Learn and Practice.', 'Pulsa {hint} (o el botón Pista) para ver una clavija que lleva a la victoria. {pause} pausa y abre la configuración. {undo} deshace en Aprender y Práctica.', 'Drücke {hint} (oder die Tipp-Taste) für einen Stift auf dem Siegesweg. {pause} pausiert und öffnet die Einstellungen. {undo} nimmt in Lernen und Training zurück.', 'Appuyez sur {hint} (ou le bouton Indice) pour une goupille gagnante. {pause} met en pause et ouvre les paramètres. {undo} annule dans Apprendre et Entraînement.', 'Aperte {hint} (ou o botão Dica) para ver um pino que leva à vitória. {pause} pausa e abre as configurações. {undo} desfaz em Aprender e Treino.', 'Premi {hint} (o il pulsante Indizio) per un perno sulla via vincente. {pause} mette in pausa e apre le impostazioni. {undo} annulla in Impara e Allenamento.'],

    // ---- HUD rails, tray, mirror
    ['Moves', 'Movimientos', 'Züge', 'Coups', 'Movimentos', 'Mosse'],
    ['{n} / par {par} · limit {limit}', '{n} / par {par} · límite {limit}', '{n} / Par {par} · Limit {limit}', '{n} / par {par} · limite {limit}', '{n} / par {par} · limite {limit}', '{n} / par {par} · limite {limit}'],
    ['{n} / par {par}', '{n} / par {par}', '{n} / Par {par}', '{n} / par {par}', '{n} / par {par}', '{n} / par {par}'],
    ['Status', 'Estado', 'Status', 'État', 'Status', 'Stato'],
    ['Player', 'Jugador', 'Spieler', 'Joueur', 'Jogador', 'Giocatore'],
    ['Saved', 'Rescatados', 'Gerettet', 'Sauvés', 'Salvos', 'Salvati'],
    ['Pins you can pull', 'Clavijas que puedes retirar', 'Ziehbare Stifte', 'Goupilles à retirer', 'Pinos que você pode puxar', 'Perni che puoi tirare'],
    ['↩ Undo (U)', '↩ Deshacer (U)', '↩ Zurück (U)', '↩ Annuler (U)', '↩ Desfazer (U)', '↩ Annulla (U)'],
    ['💡 Hint (H)', '💡 Pista (H)', '💡 Tipp (H)', '💡 Indice (H)', '💡 Dica (H)', '💡 Indizio (H)'],
    ['⏸ Pause (Esc)', '⏸ Pausa (Esc)', '⏸ Pause (Esc)', '⏸ Pause (Échap)', '⏸ Pausar (Esc)', '⏸ Pausa (Esc)'],
    ['Score {score}. Moves {n} of par {par}.', 'Puntuación {score}. Movimientos: {n} de par {par}.', 'Punkte {score}. Züge {n} bei Par {par}.', 'Score {score}. Coups : {n} pour un par de {par}.', 'Pontuação {score}. Movimentos {n} de par {par}.', 'Punteggio {score}. Mosse {n} su par {par}.'],
    ['No pins left to pull.', 'No quedan clavijas por retirar.', 'Keine Stifte mehr zum Ziehen.', 'Plus aucune goupille à retirer.', 'Não restam pinos para puxar.', 'Nessun perno da tirare.'],
    ['Pin {id}', 'Clavija {id}', 'Stift {id}', 'Goupille {id}', 'Pino {id}', 'Perno {id}'],
    ['Castle: {name}. {cols} columns, {rows} rows.', 'Castillo: {name}. {cols} columnas, {rows} filas.', 'Burg: {name}. {cols} Spalten, {rows} Reihen.', 'Château : {name}. {cols} colonnes, {rows} rangées.', 'Castelo: {name}. {cols} colunas, {rows} linhas.', 'Castello: {name}. {cols} colonne, {rows} righe.'],
    ['{n} water', '{n} de agua', '{n} Wasser', '{n} d’eau', '{n} de água', '{n} di acqua'],
    ['{n} lava', '{n} de lava', '{n} Lava', '{n} de lave', '{n} de lava', '{n} di lava'],
    ['villager', 'aldeano', 'Dorfbewohner', 'villageois', 'aldeão', 'abitante'],
    ['rescued villager', 'aldeano rescatado', 'geretteter Dorfbewohner', 'villageois sauvé', 'aldeão resgatado', 'abitante salvato'],
    ['Row {r} column {c}: {list}.', 'Fila {r}, columna {c}: {list}.', 'Reihe {r}, Spalte {c}: {list}.', 'Rangée {r}, colonne {c} : {list}.', 'Linha {r}, coluna {c}: {list}.', 'Riga {r}, colonna {c}: {list}.'],
    ['{n} pins remain.', 'Quedan {n} clavijas.', 'Noch {n} Stifte.', 'Il reste {n} goupilles.', 'Restam {n} pinos.', 'Restano {n} perni.'],
    ['Board state', 'Estado del tablero', 'Spielfeldzustand', 'État du plateau', 'Estado do tabuleiro', 'Stato del tavolo'],
    ['Cloud save synced', 'Guardado en la nube sincronizado', 'Cloud-Spielstand synchronisiert', 'Sauvegarde en ligne synchronisée', 'Salvamento na nuvem sincronizado', 'Salvataggio cloud sincronizzato'],
    ['Cloud saving…', 'Guardando en la nube…', 'Cloud-Speicherung …', 'Sauvegarde en ligne…', 'Salvando na nuvem…', 'Salvataggio cloud…'],
    ['Cloud connecting…', 'Conectando con la nube…', 'Cloud-Verbindung …', 'Connexion en ligne…', 'Conectando à nuvem…', 'Connessione al cloud…'],
    ['Cloud sync error — local copy safe', 'Error de sincronización: la copia local está a salvo', 'Cloud-Synchronisierungsfehler – lokale Kopie sicher', 'Erreur de synchronisation — copie locale en sécurité', 'Erro de sincronização — cópia local segura', 'Errore di sincronizzazione: copia locale al sicuro'],
    ['Player {id}', 'Jugador {id}', 'Spieler {id}', 'Joueur {id}', 'Jogador {id}', 'Giocatore {id}'],

    // ---- content: themes, lessons, achievements
    ['Emerald Keep', 'Torreón Esmeralda', 'Smaragdfeste', 'Donjon d’émeraude', 'Torre Esmeralda', 'Rocca di smeraldo'],
    ['Amber Spires', 'Agujas de Ámbar', 'Bernsteintürme', 'Flèches d’ambre', 'Torres de Âmbar', 'Guglie d’ambra'],
    ['Frost Halls', 'Salas de Escarcha', 'Frosthallen', 'Salles du givre', 'Salões de Gelo', 'Sale del gelo'],
    ['Ember Depths', 'Profundidades de Ascuas', 'Gluttiefen', 'Profondeurs de braise', 'Profundezas de Brasa', 'Abissi di brace'],
    ['Moonlit Towers', 'Torres Lunares', 'Mondtürme', 'Tours au clair de lune', 'Torres ao Luar', 'Torri al chiaro di luna'],
    ['Pull a pin', 'Retira una clavija', 'Zieh einen Stift', 'Retirez une goupille', 'Puxe um pino', 'Tira un perno'],
    ['Water rescues the villager. Pull the brass pin to let the water fall.', 'El agua rescata al aldeano. Retira la clavija de latón para que caiga el agua.', 'Wasser rettet den Dorfbewohner. Zieh den Messingstift, damit das Wasser fällt.', 'L’eau sauve le villageois. Retirez la goupille en laiton pour laisser tomber l’eau.', 'A água resgata o aldeão. Puxe o pino de latão para a água cair.', 'L’acqua salva l’abitante. Tira il perno d’ottone per far cadere l’acqua.'],
    ['Keep lava away', 'Mantén lejos la lava', 'Halte die Lava fern', 'Tenez la lave à l’écart', 'Mantenha a lava longe', 'Tieni lontana la lava'],
    ['Lava is deadly. Route water to the villager while the lava stays sealed above.', 'La lava es mortal. Lleva el agua al aldeano mientras la lava sigue sellada arriba.', 'Lava ist tödlich. Leite das Wasser zum Dorfbewohner, während die Lava oben eingeschlossen bleibt.', 'La lave est mortelle. Dirigez l’eau vers le villageois pendant que la lave reste scellée en haut.', 'A lava é mortal. Leve a água ao aldeão enquanto a lava fica presa lá em cima.', 'La lava è mortale. Porta l’acqua all’abitante mentre la lava resta sigillata in alto.'],
    ['Steam safety', 'Seguridad con vapor', 'Sicher mit Dampf', 'Sécurité vapeur', 'Segurança com vapor', 'Sicurezza col vapore'],
    ['Water and lava neutralize into harmless steam. Drop the water onto the lava first — never the other way round.', 'El agua y la lava se neutralizan en vapor inofensivo. Deja caer primero el agua sobre la lava, nunca al revés.', 'Wasser und Lava werden zu harmlosem Dampf. Lass zuerst das Wasser auf die Lava fallen – nie umgekehrt.', 'L’eau et la lave se neutralisent en vapeur inoffensive. Versez d’abord l’eau sur la lave — jamais l’inverse.', 'Água e lava se neutralizam em vapor inofensivo. Solte primeiro a água sobre a lava — nunca o contrário.', 'Acqua e lava si neutralizzano in vapore innocuo. Fai cadere prima l’acqua sulla lava, mai il contrario.'],
    ['Two villagers', 'Dos aldeanos', 'Zwei Dorfbewohner', 'Deux villageois', 'Dois aldeões', 'Due abitanti'],
    ['Every villager must be rescued. Share the water between both shafts.', 'Hay que rescatar a todos los aldeanos. Reparte el agua entre ambos pozos.', 'Jeder Dorfbewohner muss gerettet werden. Teile das Wasser auf beide Schächte auf.', 'Chaque villageois doit être sauvé. Partagez l’eau entre les deux puits.', 'Todos os aldeões precisam ser resgatados. Divida a água entre os dois poços.', 'Ogni abitante va salvato. Dividi l’acqua tra i due pozzi.'],
    ['Mastery drill', 'Ejercicio de maestría', 'Meisterübung', 'Exercice de maîtrise', 'Exercício de maestria', 'Esercizio di maestria'],
    ['Combine everything: neutralize the lava first, then send water down.', 'Combínalo todo: neutraliza primero la lava y luego envía el agua hacia abajo.', 'Kombiniere alles: Entschärfe zuerst die Lava, dann schick das Wasser nach unten.', 'Combinez tout : neutralisez d’abord la lave, puis envoyez l’eau vers le bas.', 'Combine tudo: neutralize primeiro a lava e depois mande a água para baixo.', 'Combina tutto: prima neutralizza la lava, poi manda giù l’acqua.'],
    ['First Rescue', 'Primer rescate', 'Erste Rettung', 'Premier sauvetage', 'Primeiro resgate', 'Primo salvataggio'],
    ['Complete any stage.', 'Completa cualquier etapa.', 'Schaffe eine beliebige Etappe.', 'Terminez n’importe quelle étape.', 'Conclua qualquer etapa.', 'Completa una tappa qualsiasi.'],
    ['Mechanic Mastery', 'Dominio de mecánicas', 'Mechanik gemeistert', 'Maîtrise des mécaniques', 'Domínio das mecânicas', 'Padronanza delle meccaniche'],
    ['Finish all five Learn lessons.', 'Termina las cinco lecciones de Aprender.', 'Schließe alle fünf Lektionen unter Lernen ab.', 'Terminez les cinq leçons d’Apprendre.', 'Conclua as cinco lições de Aprender.', 'Completa tutte e cinque le lezioni di Impara.'],
    ['Week of Wonder', 'Semana maravillosa', 'Woche voller Wunder', 'Semaine merveilleuse', 'Semana maravilhosa', 'Settimana meravigliosa'],
    ['Complete the daily challenge on seven consecutive days.', 'Completa el desafío diario siete días seguidos.', 'Schaffe die tägliche Herausforderung an sieben Tagen in Folge.', 'Terminez le défi du jour sept jours de suite.', 'Conclua o desafio diário em sete dias seguidos.', 'Completa la sfida giornaliera per sette giorni di fila.'],
    ['Ember Depths Veteran', 'Veterano de las Profundidades de Ascuas', 'Veteran der Gluttiefen', 'Vétéran des Profondeurs de braise', 'Veterano das Profundezas de Brasa', 'Veterano degli Abissi di brace'],
    ['Clear any stage in the final theme, Ember Depths.', 'Supera cualquier etapa del último tema, Profundidades de Ascuas.', 'Schaffe eine Etappe im letzten Thema, den Gluttiefen.', 'Réussissez une étape du dernier thème, Profondeurs de braise.', 'Conclua qualquer etapa do último tema, Profundezas de Brasa.', 'Supera una tappa qualsiasi dell’ultimo tema, Abissi di brace.'],
    ['Century Guardian', 'Guardián centenario', 'Hüter der Hundert', 'Gardien centenaire', 'Guardião centenário', 'Guardiano dei cento'],
    ['Rescue 100 villagers in total.', 'Rescata a 100 aldeanos en total.', 'Rette insgesamt 100 Dorfbewohner.', 'Sauvez 100 villageois au total.', 'Resgate 100 aldeões no total.', 'Salva 100 abitanti in totale.']
  ];

  var COLS = ['es-419', 'de-DE', 'fr-FR', 'pt-BR', 'it-IT'];
  var T = { 'en-US': {} };
  COLS.forEach(function (loc) { T[loc] = {}; });
  ROWS.forEach(function (row) { COLS.forEach(function (loc, i) { T[loc][row[0]] = row[i + 1]; }); });

  // en-GB: British spelling.
  T['en-GB'] = {
    'Colorblind': 'Colourblind',
    'Every board state is mirrored as text for screen readers. No gameplay information is audio-only or color-only.': 'Every board state is mirrored as text for screen readers. No gameplay information is audio-only or colour-only.',
    'Hazards neutralized: {n}': 'Hazards neutralised: {n}',
    'Water and lava in the same chamber neutralize into inert steam.': 'Water and lava in the same chamber neutralise into inert steam.',
    'Water and lava neutralize into harmless steam. Drop the water onto the lava first — never the other way round.': 'Water and lava neutralise into harmless steam. Drop the water onto the lava first — never the other way round.',
    'Combine everything: neutralize the lava first, then send water down.': 'Combine everything: neutralise the lava first, then send water down.'
  };
  // es-ES: Spain Spanish wording.
  T['es-ES'] = {
    'Lava reached a villager.': 'La lava ha alcanzado a un aldeano.',
    'Every villager reached safety.': 'Todos los aldeanos han llegado a salvo.',
    'The flow could not settle.': 'El flujo no ha podido estabilizarse.'
  };
  // fr-CA: Canadian French (pointage for score).
  T['fr-CA'] = {
    'Score': 'Pointage',
    'Victory. Score {n}.': 'Victoire. Pointage : {n}.',
    'Score {score}. Moves {n} of par {par}.': 'Pointage {score}. Coups : {n} pour un par de {par}.'
  };

  root.RP_STRINGS = T;
})(typeof self !== 'undefined' ? self : this);
