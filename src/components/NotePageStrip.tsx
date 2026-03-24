import React, { useCallback, useEffect, useRef } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface Props {
  totalPages: number;
  currentPage: number;   // 1-indexed
  onPageSelect: (page: number) => void;
}

export default function NotePageStrip({ totalPages, currentPage, onPageSelect }: Props) {
  const listRef = useRef<FlatList>(null);
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);

  useEffect(() => {
    if (currentPage >= 1 && currentPage <= totalPages) {
      listRef.current?.scrollToIndex({
        index: currentPage - 1,
        animated: true,
        viewPosition: 0.5,
      });
    }
  }, [currentPage, totalPages]);

  const renderItem = useCallback(({ item: page }: { item: number }) => {
    const active = page === currentPage;
    return (
      <TouchableOpacity
        style={[styles.item, active && styles.itemActive]}
        onPress={() => onPageSelect(page)}
        activeOpacity={0.7}
      >
        <View style={styles.thumb} />
        <Text style={[styles.pageNum, active && styles.pageNumActive]}>{page}</Text>
      </TouchableOpacity>
    );
  }, [currentPage, onPageSelect]);

  return (
    <View style={styles.container}>
      <FlatList
        ref={listRef}
        data={pages}
        keyExtractor={String}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
        renderItem={renderItem}
        onScrollToIndexFailed={() => {}}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 140,
    backgroundColor: '#111111',
    borderTopWidth: 1,
    borderTopColor: '#333333',
  },
  list: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 6,
  },
  item: {
    width: 72,
    borderRadius: 6,
    padding: 3,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
  },
  itemActive: {
    borderColor: '#4A90E2',
  },
  thumb: {
    width: 66,
    height: 76,
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
  },
  pageNum: {
    marginTop: 4,
    fontSize: 10,
    color: '#777777',
    textAlign: 'center',
  },
  pageNumActive: {
    color: '#4A90E2',
  },
});
