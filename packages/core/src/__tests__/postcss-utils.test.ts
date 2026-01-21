import { describe, it, expect } from 'bun:test';
import {
  parseCSS,
  generateCSS,
  findRule,
  findRuleAtLine,
  findAllRules,
  getDeclaration,
  setDeclaration,
  removeDeclaration,
  getDeclarations,
  parseRuleStyles,
  setStyleValue,
  getStyleValue,
  createRule,
  addRule,
  normalizeSelector,
  getNodeLocation,
  isInMediaQuery,
  getMediaQuery,
} from '../css/postcss-utils.js';
import { createUnitValue, isUnitValue } from '../shared/css-values.js';

const sampleCSS = `
.button {
  padding: 16px;
  color: red;
  background-color: white;
}

.button.primary {
  background-color: blue;
}

.card {
  margin: 10px;
}

@media (min-width: 768px) {
  .button {
    padding: 24px;
  }
}
`;

describe('postcss-utils', () => {
  describe('parseCSS and generateCSS', () => {
    it('should parse CSS into AST', () => {
      const root = parseCSS('.test { color: red; }');
      expect(root).toBeDefined();
      expect(root.type).toBe('root');
    });

    it('should generate CSS from AST', () => {
      const root = parseCSS('.test { color: red; }');
      const css = generateCSS(root);
      expect(css).toContain('.test');
      expect(css).toContain('color: red');
    });

    it('should round-trip CSS', () => {
      const original = '.test { color: red; }';
      const root = parseCSS(original);
      const generated = generateCSS(root);
      expect(generated).toContain('color: red');
    });
  });

  describe('findRule', () => {
    it('should find rule by selector', () => {
      const root = parseCSS(sampleCSS);
      const rule = findRule(root, '.button');
      expect(rule).not.toBeNull();
      expect(rule?.selector).toBe('.button');
    });

    it('should find rule with compound selector', () => {
      const root = parseCSS(sampleCSS);
      const rule = findRule(root, '.button.primary');
      expect(rule).not.toBeNull();
    });

    it('should return null for non-existent selector', () => {
      const root = parseCSS(sampleCSS);
      const rule = findRule(root, '.nonexistent');
      expect(rule).toBeNull();
    });

    it('should be case-insensitive', () => {
      const root = parseCSS(sampleCSS);
      const rule = findRule(root, '.BUTTON');
      expect(rule).not.toBeNull();
    });
  });

  describe('findRuleAtLine', () => {
    it('should find rule near specific line', () => {
      const root = parseCSS(sampleCSS);
      // The .button rule in @media should be around line 16
      const rule = findRuleAtLine(root, '.button', 16, 5);
      expect(rule).not.toBeNull();
    });

    it('should prefer closer matches', () => {
      const root = parseCSS(sampleCSS);
      // Line 2 should match the first .button rule
      const rule = findRuleAtLine(root, '.button', 2, 5);
      expect(rule).not.toBeNull();
      expect(isInMediaQuery(rule!)).toBe(false);
    });
  });

  describe('findAllRules', () => {
    it('should find all matching rules', () => {
      const root = parseCSS(sampleCSS);
      const rules = findAllRules(root, '.button');
      // Two .button rules - one regular, one in @media
      expect(rules.length).toBe(2);
    });

    it('should return empty array for no matches', () => {
      const root = parseCSS(sampleCSS);
      const rules = findAllRules(root, '.nonexistent');
      expect(rules).toHaveLength(0);
    });
  });

  describe('getDeclaration', () => {
    it('should get declaration by property', () => {
      const root = parseCSS(sampleCSS);
      const rule = findRule(root, '.button')!;
      const decl = getDeclaration(rule, 'padding');
      expect(decl).not.toBeNull();
      expect(decl?.value).toBe('16px');
    });

    it('should return null for non-existent property', () => {
      const root = parseCSS(sampleCSS);
      const rule = findRule(root, '.button')!;
      const decl = getDeclaration(rule, 'border');
      expect(decl).toBeNull();
    });

    it('should be case-insensitive', () => {
      const root = parseCSS(sampleCSS);
      const rule = findRule(root, '.button')!;
      const decl = getDeclaration(rule, 'PADDING');
      expect(decl).not.toBeNull();
    });
  });

  describe('setDeclaration', () => {
    it('should update existing declaration', () => {
      const root = parseCSS(sampleCSS);
      const rule = findRule(root, '.button')!;
      setDeclaration(rule, 'padding', '20px');
      const decl = getDeclaration(rule, 'padding');
      expect(decl?.value).toBe('20px');
    });

    it('should add new declaration', () => {
      const root = parseCSS(sampleCSS);
      const rule = findRule(root, '.button')!;
      setDeclaration(rule, 'border', '1px solid black');
      const decl = getDeclaration(rule, 'border');
      expect(decl).not.toBeNull();
      expect(decl?.value).toBe('1px solid black');
    });
  });

  describe('removeDeclaration', () => {
    it('should remove existing declaration', () => {
      const root = parseCSS(sampleCSS);
      const rule = findRule(root, '.button')!;
      const removed = removeDeclaration(rule, 'padding');
      expect(removed).toBe(true);
      expect(getDeclaration(rule, 'padding')).toBeNull();
    });

    it('should return false for non-existent declaration', () => {
      const root = parseCSS(sampleCSS);
      const rule = findRule(root, '.button')!;
      const removed = removeDeclaration(rule, 'border');
      expect(removed).toBe(false);
    });
  });

  describe('getDeclarations', () => {
    it('should get all declarations as Map', () => {
      const root = parseCSS(sampleCSS);
      const rule = findRule(root, '.button')!;
      const decls = getDeclarations(rule);
      expect(decls.size).toBe(3);
      expect(decls.get('padding')).toBe('16px');
      expect(decls.get('color')).toBe('red');
    });
  });

  describe('parseRuleStyles', () => {
    it('should parse all declarations to StyleValues', () => {
      const root = parseCSS(sampleCSS);
      const rule = findRule(root, '.button')!;
      const styles = parseRuleStyles(rule);
      expect(styles.size).toBe(3);

      const padding = styles.get('padding');
      expect(padding).toBeDefined();
      expect(isUnitValue(padding!)).toBe(true);
      if (isUnitValue(padding!)) {
        expect(padding.value).toBe(16);
        expect(padding.unit).toBe('px');
      }
    });
  });

  describe('setStyleValue and getStyleValue', () => {
    it('should set StyleValue as declaration', () => {
      const root = parseCSS(sampleCSS);
      const rule = findRule(root, '.button')!;
      setStyleValue(rule, 'margin', createUnitValue(20, 'px'));
      const decl = getDeclaration(rule, 'margin');
      expect(decl?.value).toBe('20px');
    });

    it('should get declaration as StyleValue', () => {
      const root = parseCSS(sampleCSS);
      const rule = findRule(root, '.button')!;
      const value = getStyleValue(rule, 'padding');
      expect(value).not.toBeNull();
      expect(isUnitValue(value!)).toBe(true);
    });

    it('should return null for non-existent property', () => {
      const root = parseCSS(sampleCSS);
      const rule = findRule(root, '.button')!;
      const value = getStyleValue(rule, 'border');
      expect(value).toBeNull();
    });
  });

  describe('createRule', () => {
    it('should create rule with declarations object', () => {
      const rule = createRule('.new-class', {
        padding: '16px',
        color: 'blue',
      });
      expect(rule.selector).toBe('.new-class');
      expect(getDeclaration(rule, 'padding')?.value).toBe('16px');
    });

    it('should create rule with declarations Map', () => {
      const decls = new Map([
        ['padding', '16px'],
        ['color', 'blue'],
      ]);
      const rule = createRule('.new-class', decls);
      expect(getDeclarations(rule).size).toBe(2);
    });
  });

  describe('addRule', () => {
    it('should add new rule to stylesheet', () => {
      const root = parseCSS(sampleCSS);
      addRule(root, '.new-class', { padding: '10px' });
      const rule = findRule(root, '.new-class');
      expect(rule).not.toBeNull();
    });
  });

  describe('normalizeSelector', () => {
    it('should trim whitespace', () => {
      expect(normalizeSelector('  .button  ')).toBe('.button');
    });

    it('should collapse internal whitespace', () => {
      expect(normalizeSelector('.button   .primary')).toBe('.button .primary');
    });

    it('should lowercase', () => {
      expect(normalizeSelector('.Button')).toBe('.button');
    });
  });

  describe('getNodeLocation', () => {
    it('should get node location', () => {
      const root = parseCSS(sampleCSS);
      const rule = findRule(root, '.button')!;
      const location = getNodeLocation(rule);
      expect(location).not.toBeNull();
      expect(location?.line).toBeGreaterThan(0);
    });
  });

  describe('isInMediaQuery and getMediaQuery', () => {
    it('should detect rule in media query', () => {
      const root = parseCSS(sampleCSS);
      const rules = findAllRules(root, '.button');

      // Find the one in media query
      const mediaRule = rules.find((r) => isInMediaQuery(r));
      expect(mediaRule).toBeDefined();
      expect(getMediaQuery(mediaRule!)).toBe('(min-width: 768px)');
    });

    it('should return false for rule not in media query', () => {
      const root = parseCSS(sampleCSS);
      const rule = findRule(root, '.card')!;
      expect(isInMediaQuery(rule)).toBe(false);
      expect(getMediaQuery(rule)).toBeNull();
    });
  });
});
