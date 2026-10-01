import { memo, type ReactNode } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from './theme';

// Il markdown delle risposte dell'assistente: titoli, elenchi, citazioni, codice, tabelle semplici,
// grassetto, corsivo, codice in linea e link. Quello che non si riconosce resta testo.

type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'quote'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'table'; rows: string[][] }
  | { kind: 'rule' };

function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.trim().startsWith('```')) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) code.push(lines[i++]);
      i++;
      blocks.push({ kind: 'code', text: code.join('\n') });
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({ kind: 'heading', level: heading[1].length, text: heading[2] });
      i++;
      continue;
    }
    if (/^\s*((-\s*){3,}|(\*\s*){3,}|(_\s*){3,})$/.test(line)) {
      blocks.push({ kind: 'rule' });
      i++;
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        const cells = lines[i].trim().slice(1, -1).split('|').map((cell) => cell.trim());
        if (!cells.every((cell) => /^:?-{2,}:?$/.test(cell))) rows.push(cells);
        i++;
      }
      blocks.push({ kind: 'table', rows });
      continue;
    }
    if (/^\s*>/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) quote.push(lines[i++].replace(/^\s*>\s?/, ''));
      blocks.push({ kind: 'quote', text: quote.join(' ') });
      continue;
    }
    const bullet = /^\s*([-*+]|\d+[.)])\s+/;
    if (bullet.test(line)) {
      const ordered = /^\s*\d/.test(line);
      const items: string[] = [];
      while (i < lines.length && (bullet.test(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length > 0))) {
        if (bullet.test(lines[i])) items.push(lines[i].replace(bullet, ''));
        else items[items.length - 1] += ` ${lines[i].trim()}`;
        i++;
      }
      blocks.push({ kind: 'list', ordered, items });
      continue;
    }
    const paragraph: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|\s*>|\s*([-*+]|\d+[.)])\s+|\s*\|)/.test(lines[i])) paragraph.push(lines[i++]);
    if (paragraph.length === 0) paragraph.push(lines[i++]);
    blocks.push({ kind: 'paragraph', text: paragraph.join('\n') });
  }
  return blocks;
}

const INLINE = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\[[^\]]+\]\([^)\s]+\)|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;

function inline(text: string, key = 'i'): ReactNode[] {
  return text.split(INLINE).map((part, index) => {
    const id = `${key}-${index}`;
    if (!part) return null;
    if (/^(\*\*|__)/.test(part) && part.length > 4) return <Text key={id} style={styles.bold}>{inline(part.slice(2, -2), id)}</Text>;
    if (part.startsWith('`') && part.length > 2) return <Text key={id} style={styles.code}>{part.slice(1, -1)}</Text>;
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
    if (link) {
      return (
        <Text key={id} style={styles.link} onPress={() => void Linking.openURL(link[2])}>
          {link[1]}
        </Text>
      );
    }
    if (/^[*_]/.test(part) && part.length > 2) return <Text key={id} style={styles.italic}>{inline(part.slice(1, -1), id)}</Text>;
    return part;
  });
}

export const Markdown = memo(function Markdown({ text }: { text: string }) {
  const blocks = parseBlocks(text);
  return (
    <View style={styles.root}>
      {blocks.map((block, index) => {
        switch (block.kind) {
          case 'heading':
            return (
              <Text key={index} style={[styles.text, styles.heading, block.level <= 2 && styles.headingLarge]}>
                {inline(block.text)}
              </Text>
            );
          case 'paragraph':
            return (
              <Text key={index} style={styles.text}>
                {inline(block.text)}
              </Text>
            );
          case 'list':
            return (
              <View key={index} style={styles.list}>
                {block.items.map((item, n) => (
                  <View key={n} style={styles.item}>
                    <Text style={[styles.text, styles.bullet]}>{block.ordered ? `${n + 1}.` : '•'}</Text>
                    <Text style={[styles.text, { flex: 1 }]}>{inline(item)}</Text>
                  </View>
                ))}
              </View>
            );
          case 'quote':
            return (
              <View key={index} style={styles.quote}>
                <Text style={[styles.text, { color: colors.body }]}>{inline(block.text)}</Text>
              </View>
            );
          case 'code':
            return (
              <View key={index} style={styles.codeBlock}>
                <Text style={styles.codeText}>{block.text}</Text>
              </View>
            );
          case 'table':
            return (
              <View key={index} style={styles.table}>
                {block.rows.map((row, r) => (
                  <View key={r} style={[styles.tableRow, r === 0 && styles.tableHead]}>
                    {row.map((cell, c) => (
                      <Text key={c} style={[styles.cell, r === 0 && styles.bold]}>
                        {inline(cell)}
                      </Text>
                    ))}
                  </View>
                ))}
              </View>
            );
          case 'rule':
            return <View key={index} style={styles.rule} />;
        }
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  root: { gap: 10 },
  text: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 23, color: colors.title },
  heading: { fontFamily: fonts.semibold, fontSize: 16, marginTop: 4 },
  headingLarge: { fontSize: 18 },
  bold: { fontFamily: fonts.semibold },
  italic: { fontStyle: 'italic' },
  code: { fontFamily: 'monospace', fontSize: 13, backgroundColor: colors.grey100 },
  link: { color: colors.accentStrong, textDecorationLine: 'underline' },
  list: { gap: 6 },
  item: { flexDirection: 'row', gap: 8 },
  bullet: { minWidth: 16, color: colors.body },
  quote: { borderLeftWidth: 3, borderLeftColor: colors.accent, paddingLeft: 12 },
  codeBlock: { padding: 12, borderRadius: 10, backgroundColor: colors.grey100 },
  codeText: { fontFamily: 'monospace', fontSize: 13, lineHeight: 19, color: colors.title },
  table: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, overflow: 'hidden' },
  tableRow: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  tableHead: { backgroundColor: colors.grey100, borderTopWidth: 0 },
  cell: { flex: 1, padding: 8, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.title },
  rule: { height: 1, backgroundColor: colors.border, marginVertical: 4 },
});
