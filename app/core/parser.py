from pyparsing import Word, oneOf, infixNotation, opAssoc, ParserElement
import re
ParserElement.enablePackrat()


variable = Word("abcdefghijklmnopqrstuvwxyz_", "abcdefghijklmnopqrstuvwxyz0123456789_")

not_op = oneOf("~")
and_op = oneOf("&")
or_op = oneOf("|")
implies_op = oneOf("->")
equiv_op = oneOf("<->")

expr_parser = infixNotation(variable, [
    (not_op, 1, opAssoc.RIGHT),
    (and_op, 2, opAssoc.LEFT),
    (or_op, 2, opAssoc.LEFT),
    (implies_op, 2, opAssoc.RIGHT),  
    (equiv_op, 2, opAssoc.LEFT),      
])

def rewrite(ast):
    if not isinstance(ast, list):
        return ast 

    if len(ast) == 2 and ast[0] == "~":
        return ["~", rewrite(ast[1])]

    if len(ast) == 3:
        left, op, right = ast
        left = rewrite(left)
        right = rewrite(right)

        if op == "->":  # a -> b ≡ ~a | b
            return [["~", left],"|", right]

        if op == "<->":  # a <-> b ≡ (a & b) | (~a & ~b)
            return [[ left,"&", right],"|", [["~", left],"&", ["~", right]]]

        return [left, op, right]

    res = rewrite(ast[0])
    i = 1
    while i < len(ast):
        op = ast[i]
        right = rewrite(ast[i + 1])
        res = rewrite([res, op, right])
        i += 2
    return res


def to_str(ast):
    if not isinstance(ast, list):
        return ast
    if len(ast) == 2 and ast[0] == "~":
        return f"~({to_str(ast[1])})"
    if len(ast) == 3:
        return f"({to_str(ast[0])} {ast[1]} {to_str(ast[2])})"
    return " ".join(to_str(x) for x in ast)


def parse_formula(formula_str: str):
    ast = expr_parser.parseString(formula_str, parseAll=True).asList()[0]
    return ast

def eval_with_var(expr,var,val):
    return expr.subs({var: val})