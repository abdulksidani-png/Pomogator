import { test, expect } from '../pw';

const BT = '`';
// The question from the owner's report: LaTeX that used to show as raw text.
const QUIZ = {
  questions: [{
    id: 'q1', concept: 'Cost gradient',
    question: String.raw`Why is the magnitude of the partial derivative of the cost with respect to the final layer's activation, $\frac{\partial C_0}{\partial a^{(L)}} = 2(a^{(L)} - y)$, significant during training?`,
    options: [
      'It scales all learning rates to prevent overflow',
      String.raw`Larger gaps between $a^{(L)}$ and $y$ give proportionally larger gradients`,
      'It keeps the weights constant once the cost is zero',
      String.raw`It removes the need to compute $z^{(L)}$`,
    ],
    correctIndex: 1,
    explanation: String.raw`The gradient $2(a^{(L)} - y)$ grows with the error, so bigger mistakes get bigger corrections. A ticket costs $5 either way.`,
    memoryAid: `Twice the gap. In code: ${BT}grad = 2 * (a - y)${BT}.`,
    optionFeedback: ['Not its job.', 'Right.', 'Not what it does.', String.raw`You still need $z^{(L)}$.`],
  }],
};

test('quiz formulas are drawn as formulas, code as code, and money stays money', async ({ page }) => {
  await page.route('**/api/ai/status', (r) => r.fulfill({ json: { configured: true } }));
  await page.route('**/api/ai/quiz', (r) => r.fulfill({ json: QUIZ }));
  await page.route('**/api/ai/plan', (r) => r.fulfill({ json: { summary: 'ok', strong: [], review: [], actions: [], suggestedMinutes: 25, nextGoal: '' } }));
  await page.goto('/');
  await page.fill('#ctxTopic', 'Backpropagation');
  await page.getByRole('button', { name: /Start studying/ }).click();
  await expect(page.getByText('Quiz ready · 1 question')).toBeVisible();
  await page.getByRole('button', { name: /Finish session now/ }).click();
  await page.getByRole('button', { name: 'Start quiz' }).click();

  // The question: a real fraction, no dollar signs or backslashes left on screen.
  const q = page.locator('#qText');
  await expect(q.locator('.katex')).toHaveCount(1);
  await expect(q.locator('.katex .mfrac').first()).toBeVisible();
  await expect(q.locator('.katex-html')).not.toContainText('\\');
  await expect(q).toContainText('significant during training?');
  // Screen readers get MathML, and the option's label reads without the dollar signs.
  await expect(q.locator('math')).toHaveCount(1);
  const right = page.getByRole('button', { name: /^[A-D]: Larger gaps between a\^\{\(L\)\} and y/ }); // the options are shuffled
  await expect(right.locator('.katex')).toHaveCount(2);

  await right.click();
  const fb = page.locator('.fb');
  await expect(fb.locator('p .katex')).toHaveCount(1);
  await expect(fb).toContainText('A ticket costs $5 either way.'); // money is not math
  await expect(fb.locator('.aid code.q-code')).toHaveText('grad = 2 * (a - y)');
});
