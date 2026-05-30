import { describe, it, expect } from 'vitest';
import { computeGrade, gpa, letterFor, percentage } from '@/modules/grades/grade.calc';

describe('grade.calc', () => {
  describe('percentage', () => {
    it('computes a 2dp percentage', () => {
      expect(percentage(45, 60)).toBe(75);
      expect(percentage(1, 3)).toBe(33.33);
    });
    it('throws on invalid inputs', () => {
      expect(() => percentage(10, 0)).toThrow();
      expect(() => percentage(-1, 10)).toThrow();
      expect(() => percentage(11, 10)).toThrow();
    });
  });

  describe('letterFor', () => {
    it('maps boundaries correctly', () => {
      expect(letterFor(80).letter).toBe('A');
      expect(letterFor(79.99).letter).toBe('B');
      expect(letterFor(0).letter).toBe('F');
    });
  });

  describe('computeGrade', () => {
    it('returns percentage + letter + remark', () => {
      expect(computeGrade(90, 100)).toEqual({ percentage: 90, letter: 'A', remark: 'Excellent' });
    });
  });

  describe('gpa', () => {
    it('averages grade points on a 4.0 scale', () => {
      expect(gpa([85, 75, 65])).toBe(3);
      expect(gpa([])).toBe(0);
      expect(gpa([100])).toBe(4);
    });
  });
});
